import {
  IAMClient,
  ListPoliciesCommand,
  ListEntitiesForPolicyCommand
} from '@aws-sdk/client-iam'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class IAMRoleManagedPolicyCheck implements BPSet {
  private readonly client = new IAMClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getPolicies = async () => {
    const response = await this.memoClient.send(new ListPoliciesCommand({ Scope: 'Local' }))
    return response.Policies || []
  }

  private readonly checkEntitiesForPolicy = async (policyArn: string) => {
    const response = await this.memoClient.send(
      new ListEntitiesForPolicyCommand({ PolicyArn: policyArn })
    )
    return {
      attached: Boolean(
        response.PolicyGroups?.length || response.PolicyUsers?.length || response.PolicyRoles?.length
      )
    }
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const policies = await this.getPolicies()

    for (const policy of policies) {
      const { attached } = await this.checkEntitiesForPolicy(policy.Arn!)

      if (attached) {
        compliantResources.push(policy.Arn!)
      } else {
        nonCompliantResources.push(policy.Arn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    throw new Error(
      'Fixing orphaned managed policies requires manual review and removal. Ensure these policies are no longer needed.'
    )
  }
}
