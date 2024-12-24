import {
  ECRClient,
  DescribeRepositoriesCommand,
  PutLifecyclePolicyCommand,
  GetLifecyclePolicyCommand
} from '@aws-sdk/client-ecr'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECRPrivateLifecyclePolicyConfigured implements BPSet {
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
      try {
        await this.client.send(
          new GetLifecyclePolicyCommand({
            registryId: repository.registryId,
            repositoryName: repository.repositoryName
          })
        )
        compliantResources.push(repository.repositoryArn!)
      } catch (error: any) {
        if (error.name === 'LifecyclePolicyNotFoundException') {
          nonCompliantResources.push(repository.repositoryArn!)
        } else {
          throw error
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'lifecycle-policy' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const lifecyclePolicy = requiredParametersForFix.find(
      param => param.name === 'lifecycle-policy'
    )?.value

    if (!lifecyclePolicy) {
      throw new Error("Required parameter 'lifecycle-policy' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const repositoryName = arn.split('/').pop()!

      await this.client.send(
        new PutLifecyclePolicyCommand({
          repositoryName,
          lifecyclePolicyText: lifecyclePolicy
        })
      )
    }
  }
}
