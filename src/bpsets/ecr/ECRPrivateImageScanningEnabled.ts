import {
  ECRClient,
  DescribeRepositoriesCommand,
  PutImageScanningConfigurationCommand
} from '@aws-sdk/client-ecr'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECRPrivateImageScanningEnabled implements BPSet {
  private readonly client = new ECRClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getRepositories = async () => {
    const response = await this.memoClient.send(new DescribeRepositoriesCommand({}))
    return response.repositories || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const repositories = await this.getRepositories()

    for (const repository of repositories) {
      if (repository.imageScanningConfiguration?.scanOnPush) {
        compliantResources.push(repository.repositoryArn!)
      } else {
        nonCompliantResources.push(repository.repositoryArn!)
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
      const repositoryName = arn.split('/').pop()!

      await this.client.send(
        new PutImageScanningConfigurationCommand({
          repositoryName,
          imageScanningConfiguration: { scanOnPush: true }
        })
      )
    }
  }
}
