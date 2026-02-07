import { policyManager, ethers } from '../../config/blockchain.js';
import logger from '../../utils/logger.js';
import { BlockchainError } from '../../utils/errors.js';

// Policy status enum matching contract
const PolicyStatus = {
  0: 'PENDING',
  1: 'ACTIVE',
  2: 'CLAIMED',
  3: 'CANCELLED',
  4: 'EXPIRED',
};

// Coverage type enum matching contract
const CoverageType = {
  0: 'DROUGHT',
  1: 'FLOOD',
  2: 'PEST',
  3: 'DISEASE',
  4: 'COMPREHENSIVE',
};

/**
 * Get policy details by ID from on-chain
 */
export async function getPolicy(policyId) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    const policy = await policyManager.getPolicy(policyId);

    return {
      id: policy.id.toString(),
      farmer: policy.farmer,
      plotId: policy.plotId.toString(),
      sumInsured: ethers.formatUnits(policy.sumInsured, 6),
      premium: ethers.formatUnits(policy.premium, 6),
      startDate: new Date(Number(policy.startDate) * 1000),
      endDate: new Date(Number(policy.endDate) * 1000),
      coverageType: CoverageType[Number(policy.coverageType)] || 'UNKNOWN',
      status: PolicyStatus[Number(policy.status)] || 'UNKNOWN',
      createdAt: new Date(Number(policy.createdAt) * 1000),
    };
  } catch (error) {
    logger.error('Failed to get policy', { policyId, error: error.message });
    throw new BlockchainError('Failed to get policy', error);
  }
}

/**
 * Check if a policy exists
 */
export async function policyExists(policyId) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    return await policyManager.policyExists(policyId);
  } catch (error) {
    logger.error('Failed to check policy exists', { policyId, error: error.message });
    throw new BlockchainError('Failed to check policy exists', error);
  }
}

/**
 * Check if a policy is currently active
 */
export async function isPolicyActive(policyId) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    return await policyManager.isPolicyActive(policyId);
  } catch (error) {
    logger.error('Failed to check if policy active', { policyId, error: error.message });
    throw new BlockchainError('Failed to check if policy active', error);
  }
}

/**
 * Get all policy IDs for a farmer
 */
export async function getFarmerPolicies(farmerAddress) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    const policyIds = await policyManager.getFarmerPolicies(farmerAddress);
    return policyIds.map((id) => id.toString());
  } catch (error) {
    logger.error('Failed to get farmer policies', { farmerAddress, error: error.message });
    throw new BlockchainError('Failed to get farmer policies', error);
  }
}

/**
 * Get active policy count for a farmer
 */
export async function getFarmerActiveCount(farmerAddress) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    const count = await policyManager.getFarmerActiveCount(farmerAddress);
    return Number(count);
  } catch (error) {
    logger.error('Failed to get farmer active count', { farmerAddress, error: error.message });
    throw new BlockchainError('Failed to get farmer active count', error);
  }
}

/**
 * Get claim count for a farmer in a specific year
 */
export async function getFarmerClaimCount(farmerAddress, year) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    const count = await policyManager.getFarmerClaimCount(farmerAddress, year);
    return Number(count);
  } catch (error) {
    logger.error('Failed to get farmer claim count', { farmerAddress, year, error: error.message });
    throw new BlockchainError('Failed to get farmer claim count', error);
  }
}

/**
 * Check if a farmer can make another claim
 */
export async function canFarmerClaim(farmerAddress) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    return await policyManager.canFarmerClaim(farmerAddress);
  } catch (error) {
    logger.error('Failed to check if farmer can claim', { farmerAddress, error: error.message });
    throw new BlockchainError('Failed to check if farmer can claim', error);
  }
}

/**
 * Get total number of policies created
 */
export async function getTotalPolicies() {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    const total = await policyManager.getTotalPolicies();
    return Number(total);
  } catch (error) {
    logger.error('Failed to get total policies', { error: error.message });
    throw new BlockchainError('Failed to get total policies', error);
  }
}

/**
 * Get policy limits from contract
 */
export async function getPolicyLimits() {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    const [minSum, maxSum, minDuration, maxDuration, maxActivePolicies, maxClaimsPerYear] = await Promise.all([
      policyManager.MIN_SUM_INSURED(),
      policyManager.MAX_SUM_INSURED(),
      policyManager.MIN_DURATION_DAYS(),
      policyManager.MAX_DURATION_DAYS(),
      policyManager.MAX_ACTIVE_POLICIES_PER_FARMER(),
      policyManager.MAX_CLAIMS_PER_FARMER_PER_YEAR(),
    ]);

    return {
      minSumInsured: ethers.formatUnits(minSum, 6),
      maxSumInsured: ethers.formatUnits(maxSum, 6),
      minDurationDays: Number(minDuration),
      maxDurationDays: Number(maxDuration),
      maxActivePoliciesPerFarmer: Number(maxActivePolicies),
      maxClaimsPerFarmerPerYear: Number(maxClaimsPerYear),
    };
  } catch (error) {
    logger.error('Failed to get policy limits', { error: error.message });
    throw new BlockchainError('Failed to get policy limits', error);
  }
}

/**
 * Get current year as defined by the contract
 */
export async function getCurrentYear() {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    const year = await policyManager.getCurrentYear();
    return Number(year);
  } catch (error) {
    logger.error('Failed to get current year', { error: error.message });
    throw new BlockchainError('Failed to get current year', error);
  }
}

/**
 * Get farmer summary (policies, active count, claim eligibility)
 */
export async function getFarmerSummary(farmerAddress) {
  if (!policyManager) {
    throw new BlockchainError('PolicyManager contract not configured');
  }

  try {
    const [policyIds, activeCount, canClaim, currentYear] = await Promise.all([
      getFarmerPolicies(farmerAddress),
      getFarmerActiveCount(farmerAddress),
      canFarmerClaim(farmerAddress),
      getCurrentYear(),
    ]);

    const claimCount = await getFarmerClaimCount(farmerAddress, currentYear);

    return {
      farmerAddress,
      totalPolicies: policyIds.length,
      activePolicies: activeCount,
      claimsThisYear: claimCount,
      canClaim,
      policyIds,
    };
  } catch (error) {
    logger.error('Failed to get farmer summary', { farmerAddress, error: error.message });
    throw new BlockchainError('Failed to get farmer summary', error);
  }
}

export { PolicyStatus, CoverageType };
