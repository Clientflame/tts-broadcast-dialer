import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ExternalLink, Loader2, UserSearch } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VtigerCrmButtonProps {
  phoneNumber: string;
  /** Compact mode shows just an icon */
  compact?: boolean;
  /** Auto-open on mount (for screen-pop behavior) */
  autoOpen?: boolean;
  className?: string;
}

/**
 * Button that looks up a phone number in vTiger CRM and opens the contact page.
 * If API credentials are configured, it does a lookup first to find the exact record.
 * If not configured, it opens the vTiger search page directly.
 */
export default function VtigerCrmButton({
  phoneNumber,
  compact = false,
  autoOpen = false,
  className = "",
}: VtigerCrmButtonProps) {
  const vtigerStatus = trpc.vtiger.status.useQuery(undefined, {
    staleTime: 60000,
  });

  const lookupQuery = trpc.vtiger.lookupByPhone.useQuery(
    { phoneNumber },
    {
      enabled: !!phoneNumber && (vtigerStatus.data?.configured ?? false),
      staleTime: 30000,
      retry: false,
    }
  );

  const searchUrlQuery = trpc.vtiger.getSearchUrl.useQuery(
    { phoneNumber },
    {
      enabled: !!phoneNumber,
      staleTime: 60000,
    }
  );

  // Auto-open on mount if requested
  const hasAutoOpened = { current: false };
  if (autoOpen && !hasAutoOpened.current && lookupQuery.data) {
    hasAutoOpened.current = true;
    const results = lookupQuery.data.results;
    if (results.length > 0) {
      window.open(results[0].crmUrl, "_blank");
    } else if (searchUrlQuery.data?.url) {
      window.open(searchUrlQuery.data.url, "_blank");
    }
  }

  const handleClick = () => {
    if (!phoneNumber) {
      toast.error("No phone number available");
      return;
    }

    // If we have lookup results, open the first match
    if (lookupQuery.data?.results && lookupQuery.data.results.length > 0) {
      const contact = lookupQuery.data.results[0];
      window.open(contact.crmUrl, "_blank");
      toast.success(`Opening ${contact.firstname} ${contact.lastname} in vTiger`);
      return;
    }

    // Fallback: open vTiger search page
    if (searchUrlQuery.data?.url) {
      window.open(searchUrlQuery.data.url, "_blank");
      toast.info("Opening vTiger search for this number");
      return;
    }

    // Last resort: construct URL manually
    const baseUrl = vtigerStatus.data?.url || "https://company1233712.od2.vtiger.com";
    const normalized = phoneNumber.replace(/\D/g, "");
    const url = `${baseUrl}/index.php?module=Contacts&searchValue=${encodeURIComponent(normalized)}&search=true`;
    window.open(url, "_blank");
    toast.info("Opening vTiger search");
  };

  const isLoading = lookupQuery.isLoading;
  const hasMatch = (lookupQuery.data?.results?.length ?? 0) > 0;
  const matchName = hasMatch
    ? `${lookupQuery.data!.results[0].firstname} ${lookupQuery.data!.results[0].lastname}`.trim()
    : null;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${hasMatch ? "text-green-600 dark:text-green-400" : "text-muted-foreground"} ${className}`}
            onClick={handleClick}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserSearch className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {hasMatch ? (
            <span>Open <strong>{matchName}</strong> in vTiger CRM</span>
          ) : (
            <span>Search in vTiger CRM</span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant={hasMatch ? "default" : "outline"}
      size="sm"
      className={`gap-1.5 ${className}`}
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : hasMatch ? (
        <ExternalLink className="h-3.5 w-3.5" />
      ) : (
        <UserSearch className="h-3.5 w-3.5" />
      )}
      {hasMatch ? `CRM: ${matchName}` : "CRM Lookup"}
    </Button>
  );
}
