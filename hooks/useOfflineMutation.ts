import { useMutation, UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { addToSyncQueue } from "@/lib/offline";
import { useToast } from "@/lib/toast";

interface OfflineMutationOptions<TData, TError, TVariables, TContext>
  extends Omit<UseMutationOptions<TData, TError, TVariables, TContext>, "mutationFn"> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  endpoint: string | ((variables: TVariables) => string);
  method: string;
}

export function useOfflineMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown
>(
  options: OfflineMutationOptions<TData, TError, TVariables, TContext>
): UseMutationResult<TData, TError, TVariables, TContext> {
  const toast = useToast();

  return useMutation({
    ...options,
    mutationFn: async (variables: TVariables) => {
      // Get endpoint string
      const endpoint = typeof options.endpoint === "function" 
        ? options.endpoint(variables) 
        : options.endpoint;

      // Check if offline
      if (!navigator.onLine) {
        // Add to sync queue
        await addToSyncQueue({
          type: options.method === "PUT" ? "update" : options.method === "DELETE" ? "delete" : "create",
          endpoint,
          method: options.method,
          data: variables as any,
        });
        
        // Return a mock success response for offline operations
        // The actual sync will happen when online
        toast.success("Operation queued for sync");
        return {} as TData;
      }

      // Online: execute the mutation
      try {
        return await options.mutationFn(variables);
      } catch (error) {
        // If error occurs and we're now offline, queue it
        if (!navigator.onLine) {
          await addToSyncQueue({
            type: options.method === "PUT" ? "update" : options.method === "DELETE" ? "delete" : "create",
            endpoint,
            method: options.method,
            data: variables as any,
          });
          toast.success("Operation queued for sync");
          return {} as TData;
        }
        throw error;
      }
    },
  });
}

