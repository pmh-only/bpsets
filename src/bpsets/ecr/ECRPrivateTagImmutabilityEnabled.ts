import {
  ECRClient,
  DescribeRepositoriesCommand,
  PutImageTagMutabilityCommand
} from '@aws-sdk/client-ecr'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class ECRPrivateTagImmutabilityEnabled implements BPSet {
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
      if (repository.imageTagMutability === 'IMMUTABLE') {
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
        new PutImageTagMutabilityCommand({
          repositoryName,
          imageTagMutability: 'IMMUTABLE'
        })
      )
    }
  }
}