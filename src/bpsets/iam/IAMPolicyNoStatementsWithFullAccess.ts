import { IAMClient, ListPoliciesCommand, GetPolicyVersionCommand } from "@aws-sdk/client-iam";
import { BPSet } from "../../types";
import { Memorizer } from "../../Memorizer";

export class IAMPolicyNoStatementsWithFullAccess implements BPSet {
  private readonly client = new IAMClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  public readonly check = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];

    // Fetch all customer-managed IAM policies
    const policiesResponse = await this.memoClient.send(
      new ListPoliciesCommand({ Scope: "Local" })
    );
    const policies = policiesResponse.Policies || [];

    for (const policy of policies) {
      // Get the default version of the policy
      const policyVersionResponse = await this.memoClient.send(
        new GetPolicyVersionCommand({
          PolicyArn: policy.Arn!,
          VersionId: policy.DefaultVersionId!,
        })
      );

      const policyDocument = JSON.parse(
        decodeURIComponent(policyVersionResponse.PolicyVersion!.Document as string)
      );

      // Check statements for full access
      const hasFullAccess = policyDocument.Statement.some((statement: any) => {
        if (statement.Effect === "Deny") return false;
        const actions = Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action];
        return actions.some((action: string) => action.endsWith(":*"));
      });

      if (hasFullAccess) {
        nonCompliantResources.push(policy.Arn!);
      } else {
        compliantResources.push(policy.Arn!);
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [],
    };
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    for (const policyArn of nonCompliantResources) {
      // Add logic to remove or modify the statements with full access
      // Note: Updating an IAM policy requires creating a new version and setting it as default
      console.error(
        `Fix operation is not implemented for policy ${policyArn}. Manual intervention is required.`
      );
    }
  };
}
