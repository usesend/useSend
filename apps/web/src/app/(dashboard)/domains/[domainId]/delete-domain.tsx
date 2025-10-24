"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { Domain } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";

export const DeleteDomain: React.FC<{ domain: Domain }> = ({ domain }) => {
  const deleteDomainMutation = api.domain.deleteDomain.useMutation();
  const utils = api.useUtils();
  const router = useRouter();

  const domainSchema = z
    .object({
      confirmation: z.string().min(1, "Please type the domain name to confirm"),
    })
    .refine((data) => data.confirmation === domain.name, {
      message: "Domain name does not match",
      path: ["confirmation"],
    });

  async function onDomainDelete(values: z.infer<typeof domainSchema>) {
    deleteDomainMutation.mutate(
      {
        id: domain.id,
      },
      {
        onSuccess: () => {
          utils.domain.domains.invalidate();
          toast.success(`Domain ${domain.name} deleted`);
          router.replace("/domains");
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Delete domain"
      resourceName={domain.name}
      schema={domainSchema}
      isLoading={deleteDomainMutation.isPending}
      onConfirm={onDomainDelete}
      trigger={
        <Button variant="destructive" className="w-[150px]" size="sm">
          Delete domain
        </Button>
      }
      confirmLabel="Delete domain"
    />
  );
};

export default DeleteDomain;
