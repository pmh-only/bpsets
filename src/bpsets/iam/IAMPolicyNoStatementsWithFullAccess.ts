import {
  IAMClient,
  ListPoliciesCommand,
  GetPolicyVersionCommand,
  DeletePolicyCommand
} from '@aws-sdk/client-iam'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class IAMPolicyNoStatementsWithAdminAccess implements BPSet {
  private readonly client = new IAMClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getPolicies = async () => {
    const response = await this.memoClient.send(new ListPoliciesCommand({ Scope: 'Local' }))
    return response.Policies || []
  }

  private readonly getPolicyDefaultVersions = async (policyArn: string, versionId: string) => {
    const response = await this.memoClient.send(
      new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: versionId })
    )
    return response.PolicyVersion!
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const policies = await this.getPolicies()

    for (const policy of policies) {
      const policyVersion = await this.getPolicyDefaultVersions(policy.Arn!, policy.DefaultVersionId!)

      const policyDocument = JSON.parse(JSON.stringify(policyVersion.Document)) // Parse Document JSON string
      const statements = Array.isArray(policyDocument.Statement)
        ? policyDocument.Statement
        : [policyDocument.Statement]

      for (const statement of statements) {
        if (
          statement.Action === '*' &&
          statement.Resource === '*' &&
          statement.Effect === 'Allow'
        ) {
          nonCompliantResources.push(policy.Arn!)
          break
        }
      }

      if (!nonCompliantResources.includes(policy.Arn!)) {
        compliantResources.push(policy.Arn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      await this.client.send(new DeletePolicyCommand({ PolicyArn: arn }))
    }
  }
}
