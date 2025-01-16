import { SecurityHubClient, DescribeHubCommand, EnableSecurityHubCommand } from '@aws-sdk/client-securityhub'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SecurityHubEnabled implements BPSet {
  private readonly securityHubClient = new SecurityHubClient({})
  private readonly stsClient = new STSClient({})
  private readonly memoSecurityHubClient = Memorizer.memo(this.securityHubClient)
  private readonly memoStsClient = Memorizer.memo(this.stsClient)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'SecurityHubEnabled',
    description: 'Ensures that AWS Security Hub is enabled for the AWS account.',
    priority: 1,
    priorityReason: 'Enabling Security Hub provides centralized security insights and improves security posture.',
    awsService: 'Security Hub',
    awsServiceCategory: 'Security',
    bestPracticeCategory: 'Governance',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeHubCommand',
        reason: 'Checks if Security Hub is enabled for the AWS account.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'EnableSecurityHubCommand',
        reason: 'Enables Security Hub for the AWS account.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that enabling Security Hub aligns with your organization’s security compliance policies.'
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

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const awsAccountId = await this.getAWSAccountId()

    try {
      await this.memoSecurityHubClient.send(new DescribeHubCommand({}))
      compliantResources.push(awsAccountId)
    } catch (error: unknown) {
      if ((error as Error).name === 'InvalidAccessException') {
        nonCompliantResources.push(awsAccountId)
      } else {
        throw error
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources)
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const accountId of nonCompliantResources) {
      if (accountId) {
        await this.securityHubClient.send(new EnableSecurityHubCommand({}))
      }
    }
  }

  private readonly getAWSAccountId = async (): Promise<string> => {
    const response = await this.memoStsClient.send(new GetCallerIdentityCommand({}))
    return response.Account!
  }
}
