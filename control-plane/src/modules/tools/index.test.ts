import { createCluster } from "../management";
import { upsertToolDefinition, getWorkflowTools } from "./";

const schema = "{\"type\":\"object\",\"properties\":{\"foo\":{\"type\":\"string\"}},\"required\":[\"foo\"]}";

describe("getWorkflowTools", () => {
  let clusterId: string;
  beforeAll(async () => {
    const cluster = await createCluster({
      organizationId: Math.random().toString(),
      description: "description",
    });
    clusterId = cluster.id;

    await upsertToolDefinition({
      name: "workflows_mySearchWorkflow_1",
      description: "description",
      schema,
      clusterId,
    });

    await upsertToolDefinition({
      name: "workflows_mySearchWorkflow_2",
      description: "description",
      schema,
      clusterId,
    });

  })

  it("should fetch a workflow's tool with multiple versions", async () => {
    const tools = await getWorkflowTools({
      clusterId,
      workflowName: "mySearchWorkflow"
    });

    expect(tools.length).toBe(2);
    expect(tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "mySearchWorkflow",
        toolName: "workflows_mySearchWorkflow_1",
        version: 1,
      }),
      expect.objectContaining({
        name: "mySearchWorkflow",
        toolName: "workflows_mySearchWorkflow_2",
        version: 2,
      }),
    ]))
  });

  it("should fetch all tools if no workflow name is provided", async () => {
    const tools = await getWorkflowTools({
      clusterId,
    });

    expect(tools.length).toBe(2);
    expect(tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "mySearchWorkflow",
        toolName: "workflows_mySearchWorkflow_1",
        version: 1,
      }),
      expect.objectContaining({
        name: "mySearchWorkflow",
        toolName: "workflows_mySearchWorkflow_2",
        version: 2,
      }),
    ]))
  });

  it("should not return a non-matching workflow", async () => {
    const tools = await getWorkflowTools({
      clusterId,
      workflowName: "mySearch"
    });

    expect(tools.length).toBe(0);
  })
});
