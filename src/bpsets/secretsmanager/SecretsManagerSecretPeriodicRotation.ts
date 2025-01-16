import { SecretsManagerClient, ListSecretsCommand, RotateSecretCommand } from '@aws-sdk/client-secrets-manager'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SecretsManagerSecretPeriodicRotation implements BPSet {
  private readonly client = new SecretsManagerClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'SecretsManagerSecretPeriodicRotation',
    description: 'Ensures that Secrets Manager secrets are rotated periodically (every 90 days).',
    priority: 2,
    priorityReason: 'Periodic rotation of secrets ensures compliance with security best practices.',
    awsService: 'Secrets Manager',
    awsServiceCategory: 'Secrets',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListSecretsCommand',
        reason: 'Lists all Secrets Manager secrets to check their rotation status.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RotateSecretCommand',
        reason: 'Manually rotates the secrets that are non-compliant.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure rotation configurations (e.g., rotation Lambda) are in place before triggering manual rotation.'
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

        if (!lastRotated || now.getTime() - lastRotated.getTime() > 90 * 24 * 60 * 60 * 1000) {
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
