import { AlertTriangle, Bot, Rocket, Key, Pill, Zap, Binary } from "lucide-react";
import { ReadOnlyJSON } from "./read-only-json";

interface ErrorDisplayProps {
  status?: number;
  error?: any;
  meta?: Record<string, unknown>;
}

const getHumorousMessage = (status?: number): { message: string; icon: JSX.Element } => {
  switch (status) {
    case 400:
      return {
        message: "Bad request - even WALL-E could organize garbage better than this!",
        icon: <Bot className="h-5 w-5" />,
      };
    case 401:
      return {
        message: "Access denied - 'I'm sorry Dave, I'm afraid I can't do that.'",
        icon: <Rocket className="h-5 w-5" />,
      };
    case 403:
      return {
        message: "Forbidden - 'I'm sorry Dave, I'm afraid I can't do that.'",
        icon: <Key className="h-5 w-5" />,
      };
    case 404:
      return {
        message: "Page not found - It's probably hiding in the Matrix. Take the red pill?",
        icon: <Pill className="h-5 w-5" />,
      };
    case 500:
      return {
        message: "Server error - or Skynet is acting up again! Devs are on it.",
        icon: <Binary className="h-5 w-5" />,
      };
    case 503:
      return {
        message: "Service unavailable - Our servers are on strike! Devs are on it.",
        icon: <Zap className="h-5 w-5" />,
      };
    default:
      return {
        message: "Devs are on it.",
        icon: <Bot className="h-5 w-5" />,
      };
  }
};

export default function ErrorDisplay({ status, error, meta }: ErrorDisplayProps) {
  const errorContent = getHumorousMessage(status);

  const message = error?.body?.error?.message || error?.error?.message || error?.message;

  return (
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-5 w-5 text-red-500" aria-hidden="true" />
      <p className="text-sm text-gray-600">{message || errorContent.message}</p>
    </div>
  );
}
