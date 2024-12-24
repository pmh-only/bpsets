import {
  SecretsManagerClient,
  ListSecretsCommand,
  RotateSecretCommand
} from '@aws-sdk/client-secrets-manager'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SecretsManagerScheduledRotationSuccessCheck implements BPSet {
  private readonly client = new SecretsManagerClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getSecrets = async () => {
    const response = await this.memoClient.send(new ListSecretsCommand({}))
    return response.SecretList || []
  }

  public readonly check = async () => {
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

        if (!lastRotated || !rotationPeriod || now.getTime() - lastRotated.getTime() > rotationPeriod * 24 * 60 * 60 * 1000) {
          nonCompliantResources.push(secret.ARN!)
        } else {
          compliantResources.push(secret.ARN!)
        }
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
      await this.client.send(
        new RotateSecretCommand({
          SecretId: arn
        })
      )
    }
  }
}
