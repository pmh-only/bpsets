import { IAMClient, ListPoliciesCommand, GetPolicyVersionCommand, DeletePolicyCommand } from '@aws-sdk/client-iam'
import { BPSet, BPSetStats } from '../../types'
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

  public readonly getMetadata = () => ({
    name: 'IAMPolicyNoStatementsWithAdminAccess',
    description: 'Ensures IAM policies do not contain statements granting full administrative access.',
    priority: 1,
    priorityReason: 'Granting full administrative access can lead to security vulnerabilities.',
    awsService: 'IAM',
    awsServiceCategory: 'Security, Identity, & Compliance',
    bestPracticeCategory: 'IAM',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'ListPoliciesCommand',
        reason: 'Fetches all local IAM policies.'
      },
      {
        name: 'GetPolicyVersionCommand',
        reason: 'Retrieves the default version of each policy.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'DeletePolicyCommand',
        reason: 'Deletes non-compliant IAM policies.'
      }
    ],
    adviseBeforeFixFunction: 'Deleting policies is irreversible. Verify policies before applying fixes.'
  })

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

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
      () => (this.stats.status = 'FINISHED'),
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
      const policyVersion = await this.getPolicyDefaultVersions(policy.Arn!, policy.DefaultVersionId!)

      const policyDocument = JSON.parse(JSON.stringify(policyVersion.Document)) // Parse Document JSON string
      const statements = Array.isArray(policyDocument.Statement) ? policyDocument.Statement : [policyDocument.Statement]

      for (const statement of statements) {
        if (statement?.Action === '*' && statement?.Resource === '*' && statement?.Effect === 'Allow') {
          nonCompliantResources.push(policy.Arn!)
          break
        }
      }

      if (!nonCompliantResources.includes(policy.Arn!)) {
        compliantResources.push(policy.Arn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      await this.client.send(new DeletePolicyCommand({ PolicyArn: arn }))
    }
  }
}
