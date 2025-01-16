import { SecretsManagerClient, ListSecretsCommand, RotateSecretCommand } from '@aws-sdk/client-secrets-manager'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SecretsManagerRotationEnabledCheck implements BPSet {
  private readonly client = new SecretsManagerClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'SecretsManagerRotationEnabledCheck',
    description: 'Ensures all Secrets Manager secrets have rotation enabled.',
    priority: 2,
    priorityReason: 'Enabling rotation helps keep secrets secure by periodically rotating them.',
    awsService: 'Secrets Manager',
    awsServiceCategory: 'Secrets',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListSecretsCommand',
        reason: 'To list all secrets managed by Secrets Manager.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RotateSecretCommand',
        reason: 'To enable rotation for secrets without it enabled.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that the secrets have a rotation lambda or custom rotation strategy configured before enabling rotation.'
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
        compliantResources.push(secret.ARN!)
      } else {
        nonCompliantResources.push(secret.ARN!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
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
