import prisma from '../config/database.js';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import { normalizePhone } from '../utils/helpers.js';

const SESSION_TTL = 600; // 10 minutes

const ussdService = {
  async handleRequest(sessionId, serviceCode, phoneNumber, text) {
    try {
      const organization = await prisma.organization.findFirst({
        where: { ussdShortCode: serviceCode },
      });

      if (!organization) {
        return 'END Service unavailable';
      }

      const normalizedPhone = normalizePhone(phoneNumber);

      const sessionKey = `ussd:${sessionId}`;
      const rawSession = await redis.get(sessionKey);
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
        default:
          response = 'END An error occurred. Please try again.';
      }

      if (response.startsWith('END')) {
        await redis.del(sessionKey);
      } else {
        await redis.set(sessionKey, JSON.stringify(session), 'EX', SESSION_TTL);
      }

      return response;
    } catch (error) {
      logger.error('USSD request error', { sessionId, error: error.message });
      return 'END An error occurred. Please try again.';
    }
  },

  async _handleMainMenu(session, input, organization) {
    if (!input) {
      return `CON Welcome to ${organization.brandName}\n1. Register\n2. Buy Insurance\n3. Check Policy\n4. My Account`;
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
      default:
        return `CON Welcome to ${organization.brandName}\n1. Register\n2. Buy Insurance\n3. Check Policy\n4. My Account`;
    }
  },

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

      return 'END Registration successful! Your KYC is pending approval.';
    } catch (error) {
      logger.error('USSD registration failed', { error: error.message });
      return 'END Registration failed. You may already be registered.';
    }
  },

  async _handleBuyStart(session, input, organization, phoneNumber) {
    const farmer = await prisma.farmer.findFirst({
      where: { phoneNumber, organizationId: organization.id },
      include: { plots: true },
    });

    if (!farmer) {
      return 'END Please register first.';
    }

    if (!farmer.plots || farmer.plots.length === 0) {
      return 'END No plots found. Contact your agent to add plots.';
    }

    session.data.farmerId = farmer.id;
    session.data.plots = farmer.plots.map((p) => ({ id: p.id, name: p.name }));

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

    // Approximate premium calculation (8% base rate, adjusted by duration factor)
    const durationFactor = duration <= 90 ? 0.5 : duration <= 180 ? 1.0 : 1.5;
    const premium = Math.round(session.data.sumInsured * 0.08 * durationFactor);
    session.data.premium = premium;

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

        const policyNumber = `POL-${now.getFullYear()}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;

        await prisma.policy.create({
          data: {
            policyNumber,
            organizationId: organization.id,
            poolAddress: organization.poolAddress || 'pending',
            farmerId: farmer.id,
            plotId: session.data.selectedPlot.id,
            coverageType: 'COMPREHENSIVE',
            sumInsured: session.data.sumInsured,
            premium: session.data.premium,
            platformFee: Math.round(session.data.premium * 0.05),
            netPremium: Math.round(session.data.premium * 0.95),
            startDate: now,
            endDate,
            durationDays: session.data.duration,
            status: 'PENDING',
          },
        });

        return `END Policy created! Pay KES ${session.data.premium} to activate.`;
      } catch (error) {
        logger.error('USSD policy creation failed', { error: error.message });
        return 'END Failed to create policy. Please try again.';
      }
    } else if (input === '2') {
      return 'END Cancelled.';
    }

    return 'END Invalid selection.';
  },

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
        status: 'ACTIVE',
      },
      include: { plot: true },
    });

    if (policies.length === 0) {
      return 'END No active policies.';
    }

    const policyList = policies
      .map((p) => `${p.policyNumber} - ${p.plot?.name || 'N/A'} (KES ${p.sumInsured})`)
      .join('\n');

    return `END Your policies:\n${policyList}`;
  },

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
};

export default ussdService;
