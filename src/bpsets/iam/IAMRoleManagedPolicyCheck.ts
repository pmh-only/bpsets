import { IAMClient, ListPoliciesCommand, ListEntitiesForPolicyCommand } from '@aws-sdk/client-iam'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class IAMRoleManagedPolicyCheck implements BPSet {
  private readonly client = new IAMClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'IAMRoleManagedPolicyCheck',
    description: 'Checks whether managed IAM policies are attached to any entities (roles, users, or groups).',
    priority: 3,
    priorityReason:
      'Orphaned managed policies may indicate unused resources that can be removed for better security and resource management.',
    awsService: 'IAM',
    awsServiceCategory: 'Access Management',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListPoliciesCommand',
        reason: 'Retrieve all customer-managed IAM policies.'
      },
      {
        name: 'ListEntitiesForPolicyCommand',
        reason: 'Check if policies are attached to any users, roles, or groups.'
      }
    ],
    commandUsedInFixFunction: [],
    adviseBeforeFixFunction: 'Ensure orphaned policies are no longer required before removing them.'
  })

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => {
        this.stats.status = 'FINISHED'
      },
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const policies = await this.getPolicies()

    for (const policy of policies) {
      const { attached } = await this.checkEntitiesForPolicy(policy.Arn!)

      if (attached) {
        compliantResources.push(policy.Arn!)
      } else {
        nonCompliantResources.push(policy.Arn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async () => {
    throw new Error(
      'Fixing orphaned managed policies requires manual review and removal. Ensure these policies are no longer needed.'
    )
  }

  private readonly getPolicies = async () => {
    const response = await this.memoClient.send(new ListPoliciesCommand({ Scope: 'Local' }))
    return response.Policies || []
  }

  private readonly checkEntitiesForPolicy = async (policyArn: string) => {
    const response = await this.memoClient.send(new ListEntitiesForPolicyCommand({ PolicyArn: policyArn }))
    return {
      attached: Boolean(response.PolicyGroups?.length || response.PolicyUsers?.length || response.PolicyRoles?.length)
    }
  }
}
