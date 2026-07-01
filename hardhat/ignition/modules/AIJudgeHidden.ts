import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AIJudgeHiddenModule", (m) => {
  const aiJudgeHidden = m.contract("AIJudgeHidden");

  return { aiJudgeHidden };
});