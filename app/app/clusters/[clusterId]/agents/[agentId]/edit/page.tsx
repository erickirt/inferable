"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  JobMetricsCharts,
  AgentMetricsCharts,
} from "@/components/AgentMetrticsCharts";
import { AgentForm } from "@/components/chat/agent-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";

export default function EditAgent({
  params,
}: {
  params: { clusterId: string; agentId: string };
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [agent, setAgent] = useState<ClientInferResponseBody<
    typeof contract.getAgent,
    200
  > | null>(null);
  const { getToken } = useAuth();

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const [metrics, setMetrics] = useState<ClientInferResponseBody<
    typeof contract.getAgentMetrics
  > | null>(null);

  const fetchAgent = useCallback(async () => {
    try {
      const response = await client.getAgent({
        params: { clusterId: params.clusterId, agentId: params.agentId },
        query: {
          withPreviousVersions: "true",
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      });

      if (response.status === 200) {
        setAgent(response.body);
        setSelectedVersion(null);
      } else {
        createErrorToast(response, "Failed to fetch Agent");
      }
    } catch (error) {
      toast.error(
        `An error occurred while fetching the Agent: ${error}`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [params.clusterId, params.agentId, getToken]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  const handleSubmit = async (formData: {
    name: string;
    initialPrompt?: string;
    systemPrompt?: string;
    attachedFunctions: string;
    resultSchema?: string;
    inputSchema?: string;
  }) => {
    try {
      const response = await client.upsertAgent({
        params: { clusterId: params.clusterId, agentId: params.agentId },
        body: {
          initialPrompt:
            formData.initialPrompt === "" ? undefined : formData.initialPrompt,
          systemPrompt:
            formData.systemPrompt === "" ? undefined : formData.systemPrompt,
          name: formData.name === "" ? undefined : formData.name,
          resultSchema: formData.resultSchema
            ? JSON.parse(formData.resultSchema)
            : undefined,
          inputSchema: formData.inputSchema
            ? JSON.parse(formData.inputSchema)
            : undefined,
          attachedFunctions: formData.attachedFunctions
            .split(",")
            .map((f) => f.trim())
            .filter((f) => f !== ""),
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      });

      if (response.status === 200) {
        toast.success("Agent updated successfully");
        router.push(`/clusters/${params.clusterId}/agents`);
      } else {
        toast.error(`Failed to update Agent: ${response.status}`);
      }
    } catch (error) {
      toast.error(`An error occurred while updating the Agent: ${error}`);
    }
  };

  useEffect(() => {
    const fetchMetrics = async () => {
      const response = await client.getAgentMetrics({
        params: { clusterId: params.clusterId, agentId: params.agentId },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      });

      if (response.status === 200) {
        setMetrics(response.body);
      } else {
        toast.error(`Failed to fetch metrics: ${response.status}`);
      }
    };

    fetchMetrics();
  }, [params.clusterId, params.agentId, getToken]);

  if (isLoading) {
    return <div className="">Loading...</div>;
  }

  if (!agent) {
    return <div className="">Prompt template not found</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Update Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Modify your Agent below.
          </p>
          <div className="flex space-x-2 mb-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">
                  Switch Version <ChevronDownIcon className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-32">
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      fetchAgent();
                      toast.success("Switched to current version");
                    }}
                  >
                    Current
                  </Button>
                  {agent.versions
                    .sort((a, b) => b.version - a.version)
                    .map((version) => (
                      <Button
                        key={version.version}
                        variant="ghost"
                        className={cn(
                          "w-full justify-start",
                          selectedVersion === version.version
                            ? "bg-accent"
                            : "",
                        )}
                        onClick={() => {
                          setAgent({
                            ...agent,
                            name: version.name,
                            initialPrompt: version.initialPrompt,
                            systemPrompt: version.systemPrompt,
                            attachedFunctions: version.attachedFunctions,
                            resultSchema: version.resultSchema,
                            inputSchema: version.inputSchema,
                          });
                          setSelectedVersion(version.version);
                          toast.success(
                            `Switched to version v${version.version}`,
                          );
                        }}
                      >
                        v{version.version}
                      </Button>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="secondary"
              onClick={() => {
                router.push(
                  `/clusters/${params.clusterId}/runs?filters=${encodeURIComponent(
                    JSON.stringify({
                      agentId: params.agentId,
                    }),
                  )}`,
                );
              }}
            >
              Show runs
            </Button>
          </div>
          <AgentForm
            key={selectedVersion ?? "latest"}
            initialData={{
              name: agent.name,
              initialPrompt: agent.initialPrompt ?? undefined,
              systemPrompt: agent.systemPrompt ?? undefined,
              attachedFunctions: agent.attachedFunctions,
              resultSchema: agent.resultSchema
                ? agent.resultSchema
                : undefined,
              inputSchema: agent.inputSchema
                ? agent.inputSchema
                : undefined,
            }}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      <div className="lg:col-span-1">
        {metrics ? (
          <>
            <AgentMetricsCharts metrics={metrics} />
            <div className="h-8" />
            <JobMetricsCharts metrics={metrics} />
          </>
        ) : (
          <p>Loading metrics...</p>
        )}
      </div>
    </div>
  );
}
