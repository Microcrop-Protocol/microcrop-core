import prisma from '../config/database.js';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import { normalizePhone, generatePolicyNumber } from '../utils/helpers.js';
import { getDurationFactor, BASE_PREMIUM_RATE, PLATFORM_FEE_PERCENT, CROP_FACTORS } from '../utils/constants.js';
import paymentService from './payment.service.js';
import { addNotificationJob } from '../workers/notification.worker.js';

const SESSION_TTL = 600; // 10 minutes

const ussdService = {
  async handleRequest(sessionId, serviceCode, phoneNumber, text) {
    const sessionKey = `ussd:${sessionId}`;
    const lockKey = `ussd:lock:${sessionId}`;

    // Acquire session lock (5s TTL) to prevent concurrent request corruption
    let lockAcquired = false;
    try {
      const lockResult = await redis.set(lockKey, '1', 'EX', 5, 'NX');
      lockAcquired = lockResult === 'OK';
    } catch (redisErr) {
      logger.error('Redis unavailable for USSD session lock', { sessionId, error: redisErr.message });
      return 'END Service temporarily unavailable. Please try again.';
    }

    if (!lockAcquired) {
      return 'END Please wait, your request is being processed.';
    }

    try {
      const organization = await prisma.organization.findFirst({
        where: { ussdShortCode: serviceCode },
      });

      if (!organization) {
        return 'END Service unavailable';
      }

      const normalizedPhone = normalizePhone(phoneNumber);

      let rawSession;
      try {
        rawSession = await redis.get(sessionKey);
      } catch (redisErr) {
        logger.error('Redis unavailable for USSD session read', { sessionId, error: redisErr.message });
        return 'END Service temporarily unavailable. Please try again.';
      }

      let session = rawSession ? JSON.parse(rawSession) : { state: 'MAIN_MENU', data: {} };

      const selections = text ? text.split('*') : [];
      const currentInput = selections.length > 0 ? selections[selections.length - 1] : '';

      let response;

      switch (session.state) {
        case 'MAIN_MENU':
          response = await this._handleMainMenu(session, currentInput, organization);
          break;
        case 'REGISTER_NAME':
          response = await this._handleRegisterName(session, currentInput);
          break;
        case 'REGISTER_ID':
          response = await this._handleRegisterId(session, currentInput);
          break;
        case 'REGISTER_COUNTY':
          response = await this._handleRegisterCounty(session, currentInput, organization, normalizedPhone);
          break;
        case 'BUY_START':
          response = await this._handleBuyStart(session, currentInput, organization, normalizedPhone);
          break;
        case 'BUY_SELECT_PLOT':
          response = await this._handleBuySelectPlot(session, currentInput);
          break;
        case 'BUY_SUM':
          response = await this._handleBuySum(session, currentInput);
          break;
        case 'BUY_DURATION':
          response = await this._handleBuyDuration(session, currentInput);
          break;
        case 'BUY_CONFIRM':
          response = await this._handleBuyConfirm(session, currentInput, organization, normalizedPhone);
          break;
        case 'CHECK_POLICY':
          response = await this._handleCheckPolicy(organization, normalizedPhone);
          break;
        case 'MY_ACCOUNT':
          response = await this._handleMyAccount(organization, normalizedPhone);
          break;
        case 'PAY_PENDING_LIST':
          response = await this._handlePayPendingList(session, currentInput, organization, normalizedPhone);
          break;
        case 'PAY_PENDING_CONFIRM':
          response = await this._handlePayPendingConfirm(session, currentInput, organization, normalizedPhone);
          break;
        default:
          response = 'END An error occurred. Please try again.';
      }

      try {
        if (response.startsWith('END')) {
          await redis.del(sessionKey);
        } else {
          await redis.set(sessionKey, JSON.stringify(session), 'EX', SESSION_TTL);
        }
      } catch (redisErr) {
        logger.error('Redis unavailable for USSD session write', { sessionId, error: redisErr.message });
      }

      return response;
    } catch (error) {
      logger.error('USSD request error', { sessionId, error: error.message });
      return 'END An error occurred. Please try again.';
    } finally {
      // Always release session lock
      try {
        await redis.del(lockKey);
      } catch {
        // Lock will auto-expire after 5s
      }
    }
  },

  // ── Main Menu ──────────────────────────────────────────────────────────

  async _handleMainMenu(session, input, organization) {
    const menu = `CON Welcome to ${organization.brandName}\n1. Register\n2. Buy Insurance\n3. Check Policy\n4. My Account\n5. Pay Pending`;

    if (!input) {
      return menu;
    }

    switch (input) {
      case '1':
        session.state = 'REGISTER_NAME';
        return 'CON Enter your full name:';
      case '2':
        session.state = 'BUY_START';
        return 'CON Loading...';
      case '3':
        session.state = 'CHECK_POLICY';
        return 'CON Loading...';
      case '4':
        session.state = 'MY_ACCOUNT';
        return 'CON Loading...';
      case '5':
        session.state = 'PAY_PENDING_LIST';
        return 'CON Loading...';
      default:
        return menu;
    }
  },

  // ── Registration Flow ──────────────────────────────────────────────────

  async _handleRegisterName(session, input) {
    session.data.name = input;
    session.state = 'REGISTER_ID';
    return 'CON Enter your National ID:';
  },

  async _handleRegisterId(session, input) {
    session.data.nationalId = input;
    session.state = 'REGISTER_COUNTY';
    return 'CON Enter your county:';
  },

  async _handleRegisterCounty(session, input, organization, phoneNumber) {
    session.data.county = input;

    try {
      const nameParts = (session.data.name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      await prisma.farmer.create({
        data: {
          organizationId: organization.id,
          phoneNumber,
          nationalId: session.data.nationalId,
          firstName,
          lastName,
          county: session.data.county,
          subCounty: session.data.county,
          kycStatus: 'PENDING',
        },
      });

      addNotificationJob({
        type: 'REGISTRATION',
        phoneNumber,
        message: `Welcome to ${organization.brandName}! Registration successful. KYC verification is pending - your agent will review your details.`,
      }).catch((err) => logger.warn('Failed to queue registration SMS', { error: err.message }));

      return 'END Registration successful! Your KYC is pending approval.';
    } catch (error) {
      logger.error('USSD registration failed', { error: error.message });
      return 'END Registration failed. You may already be registered.';
    }
  },

  // ── Buy Insurance Flow ─────────────────────────────────────────────────

  async _handleBuyStart(session, input, organization, phoneNumber) {
    const farmer = await prisma.farmer.findFirst({
      where: { phoneNumber, organizationId: organization.id },
      include: { plots: true },
    });

    if (!farmer) {
      return 'END Please register first.';
    }

    if (farmer.kycStatus !== 'APPROVED') {
      return `END Your KYC is ${farmer.kycStatus.toLowerCase()}. Contact your agent for approval.`;
    }

    if (!organization.poolAddress || organization.poolAddress === 'pending') {
      return 'END Insurance not yet available. Please try again later.';
    }

    if (!farmer.plots || farmer.plots.length === 0) {
      return 'END No plots found. Contact your agent to add plots.';
    }

    session.data.farmerId = farmer.id;
    session.data.plots = farmer.plots.map((p) => ({ id: p.id, name: p.name, cropType: p.cropType }));

    const plotList = farmer.plots.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    session.state = 'BUY_SELECT_PLOT';
    return `CON Select plot:\n${plotList}`;
  },

  async _handleBuySelectPlot(session, input) {
    const plotIndex = parseInt(input, 10) - 1;
    const plots = session.data.plots || [];

    if (plotIndex < 0 || plotIndex >= plots.length) {
      return 'END Invalid selection.';
    }

    session.data.selectedPlot = plots[plotIndex];
    session.data.cropFactor = CROP_FACTORS[plots[plotIndex].cropType] || 1.0;
    session.state = 'BUY_SUM';
    return 'CON Enter sum insured (KES):';
  },

  async _handleBuySum(session, input) {
    const sumInsured = parseFloat(input);
    if (isNaN(sumInsured) || sumInsured <= 0) {
      return 'END Invalid amount.';
    }

    session.data.sumInsured = sumInsured;
    session.state = 'BUY_DURATION';
    return 'CON Coverage duration (days, 30-365):';
  },

  async _handleBuyDuration(session, input) {
    const duration = parseInt(input, 10);
    if (isNaN(duration) || duration < 30 || duration > 365) {
      return 'END Invalid duration. Must be between 30 and 365 days.';
    }

    session.data.duration = duration;

    const durationFactor = getDurationFactor(duration);
    const cropFactor = session.data.cropFactor || 1.0;
    const premium = Math.round(session.data.sumInsured * BASE_PREMIUM_RATE * cropFactor * durationFactor);
    const platformFee = Math.round((premium * PLATFORM_FEE_PERCENT) / 100);
    const netPremium = premium - platformFee;

    session.data.premium = premium;
    session.data.platformFee = platformFee;
    session.data.netPremium = netPremium;

    session.state = 'BUY_CONFIRM';
    return `CON Premium: KES ${premium}\n1. Confirm\n2. Cancel`;
  },

  async _handleBuyConfirm(session, input, organization, phoneNumber) {
    if (input === '1') {
      try {
        const farmer = await prisma.farmer.findFirst({
          where: { phoneNumber, organizationId: organization.id },
        });

        if (!farmer) {
          return 'END Error: Farmer not found.';
        }

        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + session.data.duration);

        const policyNumber = generatePolicyNumber();

        const policy = await prisma.policy.create({
          data: {
            policyNumber,
            organizationId: organization.id,
            poolAddress: organization.poolAddress,
            farmerId: farmer.id,
            plotId: session.data.selectedPlot.id,
            coverageType: 'COMPREHENSIVE',
            sumInsured: session.data.sumInsured,
            premium: session.data.premium,
            platformFee: session.data.platformFee,
            netPremium: session.data.netPremium,
            startDate: now,
            endDate,
            durationDays: session.data.duration,
            status: 'PENDING',
          },
        });

        // Trigger M-Pesa STK push — user gets payment prompt on their phone
        try {
          await paymentService.initiatePremiumPayment(organization.id, {
            reference: policy.id,
            phoneNumber,
            amount: session.data.premium,
          });

          addNotificationJob({
            type: 'POLICY_CREATED',
            phoneNumber,
            message: `${organization.brandName}: Policy ${policyNumber} created for ${session.data.selectedPlot.name}. Sum insured: KES ${session.data.sumInsured}. Check your phone for M-Pesa prompt of KES ${session.data.premium}.`,
          }).catch((err) => logger.warn('Failed to queue policy SMS', { error: err.message }));

          return `END Policy ${policyNumber} created!\nCheck your phone for M-Pesa prompt.\nPremium: KES ${session.data.premium}`;
        } catch (paymentError) {
          // Policy created but M-Pesa initiation failed — farmer can retry via Pay Pending
          logger.error('USSD M-Pesa initiation failed', {
            policyId: policy.id,
            error: paymentError.message,
          });

          addNotificationJob({
            type: 'POLICY_PAYMENT_FAILED',
            phoneNumber,
            message: `${organization.brandName}: Policy ${policyNumber} created but payment could not start. Dial back and select "Pay Pending" to retry.`,
          }).catch((err) => logger.warn('Failed to queue payment failure SMS', { error: err.message }));

          return `END Policy ${policyNumber} created.\nPayment failed to start.\nDial back and select "Pay Pending" to retry.`;
        }
      } catch (error) {
        logger.error('USSD policy creation failed', { error: error.message });
        return 'END Failed to create policy. Please try again.';
      }
    } else if (input === '2') {
      return 'END Cancelled.';
    }

    return 'END Invalid selection.';
  },

  // ── Check Policy ───────────────────────────────────────────────────────

  async _handleCheckPolicy(organization, phoneNumber) {
    const farmer = await prisma.farmer.findFirst({
      where: { phoneNumber, organizationId: organization.id },
    });

    if (!farmer) {
      return 'END Please register first.';
    }

    const policies = await prisma.policy.findMany({
      where: {
        farmerId: farmer.id,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      include: { plot: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (policies.length === 0) {
      return 'END No policies found.';
    }

    const policyList = policies
      .map((p) => {
        const tag = p.status === 'PENDING' ? '[UNPAID]' : '[ACTIVE]';
        return `${tag} ${p.policyNumber} - ${p.plot?.name || 'N/A'}`;
      })
      .join('\n');

    return `END Your policies:\n${policyList}`;
  },

  // ── My Account ─────────────────────────────────────────────────────────

  async _handleMyAccount(organization, phoneNumber) {
    const farmer = await prisma.farmer.findFirst({
      where: { phoneNumber, organizationId: organization.id },
      include: { plots: true },
    });

    if (!farmer) {
      return 'END Please register first.';
    }

    return `END Name: ${farmer.firstName} ${farmer.lastName}\nPhone: ${farmer.phoneNumber}\nKYC: ${farmer.kycStatus}\nPlots: ${farmer.plots?.length || 0}`;
  },

  // ── Pay Pending Flow ───────────────────────────────────────────────────

  async _handlePayPendingList(session, input, organization, phoneNumber) {
    const farmer = await prisma.farmer.findFirst({
      where: { phoneNumber, organizationId: organization.id },
    });

    if (!farmer) {
      return 'END Please register first.';
    }

    const pendingPolicies = await prisma.policy.findMany({
      where: {
        farmerId: farmer.id,
        organizationId: organization.id,
        status: 'PENDING',
        premiumPaid: false,
      },
      include: { plot: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (pendingPolicies.length === 0) {
      return 'END No pending policies found.';
    }

    session.data.pendingPolicies = pendingPolicies.map((p) => ({
      id: p.id,
      policyNumber: p.policyNumber,
      premium: Number(p.premium),
      plotName: p.plot?.name || 'N/A',
    }));

    const list = pendingPolicies
      .map((p, i) => `${i + 1}. ${p.policyNumber} - KES ${p.premium}`)
      .join('\n');

    session.state = 'PAY_PENDING_CONFIRM';
    return `CON Select policy to pay:\n${list}`;
  },

  async _handlePayPendingConfirm(session, input, organization, phoneNumber) {
    const index = parseInt(input, 10) - 1;
    const pendingPolicies = session.data.pendingPolicies || [];

    if (index < 0 || index >= pendingPolicies.length) {
      return 'END Invalid selection.';
    }

    const selected = pendingPolicies[index];

    try {
      await paymentService.initiatePremiumPayment(organization.id, {
        reference: selected.id,
        phoneNumber,
        amount: selected.premium,
      });

      return `END M-Pesa prompt sent for ${selected.policyNumber}.\nAmount: KES ${selected.premium}\nCheck your phone.`;
    } catch (error) {
      logger.error('USSD pay pending failed', {
        policyId: selected.id,
        error: error.message,
      });

      if (error.message?.includes('not in PENDING status')) {
        return 'END This policy is no longer pending payment.';
      }

      return 'END Payment failed. Please try again later.';
    }
  },
};

export default ussdService;
