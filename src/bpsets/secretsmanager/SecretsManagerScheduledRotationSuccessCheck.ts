import { SecretsManagerClient, ListSecretsCommand, RotateSecretCommand } from '@aws-sdk/client-secrets-manager'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SecretsManagerScheduledRotationSuccessCheck implements BPSet {
  private readonly client = new SecretsManagerClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'SecretsManagerScheduledRotationSuccessCheck',
    description: 'Checks if Secrets Manager secrets have successfully rotated within their scheduled period.',
    priority: 2,
    priorityReason: 'Ensuring secrets are rotated as per schedule is critical to maintaining security.',
    awsService: 'Secrets Manager',
    awsServiceCategory: 'Secrets',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListSecretsCommand',
        reason: 'Lists all secrets managed by Secrets Manager to determine rotation status.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RotateSecretCommand',
        reason: 'Manually rotates secrets that have not been rotated successfully within their scheduled period.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the secrets have a valid rotation lambda or custom rotation strategy configured before triggering a manual rotation.'
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
    const secrets = await this.getSecrets()

    for (const secret of secrets) {
      if (secret.RotationEnabled) {
        const now = new Date()
        const lastRotated = secret.LastRotatedDate ? new Date(secret.LastRotatedDate) : undefined
        const rotationPeriod = secret.RotationRules?.AutomaticallyAfterDays
          ? secret.RotationRules.AutomaticallyAfterDays + 2
          : undefined

        if (
          !lastRotated ||
          !rotationPeriod ||
          now.getTime() - lastRotated.getTime() > rotationPeriod * 24 * 60 * 60 * 1000
        ) {
          nonCompliantResources.push(secret.ARN!)
        } else {
          compliantResources.push(secret.ARN!)
        }
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
    for (const arn of nonCompliantResources) {
      await this.client.send(
        new RotateSecretCommand({
          SecretId: arn
        })
      )
    }
  }

  private readonly getSecrets = async () => {
    const response = await this.memoClient.send(new ListSecretsCommand({}))
    return response.SecretList || []
  }
}
