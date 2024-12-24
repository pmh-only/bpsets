import {
  SecretsManagerClient,
  ListSecretsCommand,
  RotateSecretCommand,
  UpdateSecretCommand
} from '@aws-sdk/client-secrets-manager'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SecretsManagerRotationEnabledCheck implements BPSet {
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
        compliantResources.push(secret.ARN!)
      } else {
        nonCompliantResources.push(secret.ARN!)
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
