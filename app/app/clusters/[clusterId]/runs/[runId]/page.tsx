import { Run } from "@/components/run";

function Page({
  params: { clusterId, runId },
}: {
  params: {
    clusterId: string;
    runId: string;
  };
}) {
  return <Run clusterId={clusterId} runId={runId} />;
}

export default Page;
