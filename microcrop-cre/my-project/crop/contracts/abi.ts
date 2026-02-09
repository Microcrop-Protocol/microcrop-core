export const PayoutReceiverABI = [
  {
    type: "function",
    name: "receiveDamageReport",
    inputs: [
      {
        name: "report",
        type: "tuple",
        components: [
          { name: "policyId", type: "uint256" },
          { name: "damagePercentage", type: "uint256" },
          { name: "weatherDamage", type: "uint256" },
          { name: "satelliteDamage", type: "uint256" },
          { name: "payoutAmount", type: "uint256" },
          { name: "assessedAt", type: "uint256" },
        ],
      },
      { name: "reportedWorkflowAddress", type: "address" },
      { name: "reportedWorkflowId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
