export const PayoutReceiverABI = [
  {
    type: "function",
    name: "submitDamageReport",
    inputs: [
      { name: "policyId", type: "uint256" },
      { name: "damagePercent", type: "uint256" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
