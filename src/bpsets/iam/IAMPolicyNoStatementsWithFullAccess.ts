import {
  IAMClient,
  ListPoliciesCommand,
  GetPolicyVersionCommand,
  CreatePolicyVersionCommand,
  DeletePolicyVersionCommand
} from '@aws-sdk/client-iam'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class IAMPolicyNoStatementsWithFullAccess implements BPSet {
  private readonly client = new IAMClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'IAMPolicyNoStatementsWithFullAccess',
    description: 'Ensures IAM policies do not have statements granting full access.',
    priority: 2,
    priorityReason: 'Granting full access poses a significant security risk.',
    awsService: 'IAM',
    awsServiceCategory: 'Access Management',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'policy-revision-strategy',
        description: 'Strategy to revise policies (e.g., remove, restrict actions)',
        default: 'remove',
        example: 'remove'
      }
    ],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      { name: 'ListPoliciesCommand', reason: 'Fetch all customer-managed policies.' },
      { name: 'GetPolicyVersionCommand', reason: 'Retrieve the default version of the policy.' }
    ],
    commandUsedInFixFunction: [
      { name: 'CreatePolicyVersionCommand', reason: 'Create a new policy version.' },
      { name: 'DeletePolicyVersionCommand', reason: 'Delete outdated policy versions.' }
    ],
    adviseBeforeFixFunction: "Ensure revised policies meet the organization's security and access requirements."
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

    const policiesResponse = await this.memoClient.send(new ListPoliciesCommand({ Scope: 'Local' }))
    const policies = policiesResponse.Policies || []

    for (const policy of policies) {
      const policyVersionResponse = await this.memoClient.send(
        new GetPolicyVersionCommand({
          PolicyArn: policy.Arn!,
          VersionId: policy.DefaultVersionId!
        })
      )

      const policyDocument = JSON.parse(decodeURIComponent(policyVersionResponse.PolicyVersion!.Document as string))

      const hasFullAccess = policyDocument.Statement.some((statement: unknown) => {
        if (statement.Effect === 'Deny') return false
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action]
        return actions.some((action: string) => action.endsWith(':*'))
      })

      if (hasFullAccess) {
        nonCompliantResources.push(policy.Arn!)
      } else {
        compliantResources.push(policy.Arn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    await this.fixImpl(nonCompliantResources, requiredParametersForFix).then(
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

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const strategy = requiredParametersForFix.find((param) => param.name === 'policy-revision-strategy')?.value

    if (!strategy) {
      throw new Error("Required parameter 'policy-revision-strategy' is missing.")
    }

    for (const policyArn of nonCompliantResources) {
      const policyVersionResponse = await this.memoClient.send(
        new GetPolicyVersionCommand({
          PolicyArn: policyArn,
          VersionId: 'v1'
        })
      )

      const policyDocument = JSON.parse(decodeURIComponent(policyVersionResponse.PolicyVersion!.Document as string))

      policyDocument.Statement = policyDocument.Statement.filter((statement: unknown) => {
        if (statement.Effect === 'Deny') return true
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action]
        return !actions.some((action: string) => action.endsWith(':*'))
      })

      const createVersionResponse = await this.client.send(
        new CreatePolicyVersionCommand({
          PolicyArn: policyArn,
          PolicyDocument: JSON.stringify(policyDocument),
          SetAsDefault: true
        })
      )

      if (createVersionResponse.PolicyVersion?.VersionId) {
        await this.client.send(
          new DeletePolicyVersionCommand({
            PolicyArn: policyArn,
            VersionId: policyVersionResponse.PolicyVersion!.VersionId
          })
        )
      }
    }
  }
}
