import { PipelineService } from "../PipelineService";
import { prisma } from "../../db/prisma";

jest.mock("../../db/prisma", () => ({
  prisma: {
    phaseResult: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    pipelineJob: {
      findUnique: jest.fn(),
    },
  },
}));

describe("PipelineService.confirmPhase", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports a missing phase result as a business error", async () => {
    (prisma.phaseResult.update as jest.Mock).mockRejectedValue(
      Object.assign(new Error("No record was found for an update."), { code: "P2025" }),
    );

    const service = new PipelineService({} as any);

    await expect(service.confirmPhase("job-1", "planning", "missing-step")).rejects.toThrow(
      "阶段结果不存在：planning/missing-step",
    );
  });
});
