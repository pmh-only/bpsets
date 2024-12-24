import {
  ECSClient,
  ListTaskDefinitionsCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand
} from '@aws-sdk/client-ecs'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECSAwsVpcNetworkingEnabled implements BPSet {
  private readonly client = new ECSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getTaskDefinitions = async () => {
    const taskDefinitionArns = await this.memoClient.send(
      new ListTaskDefinitionsCommand({ status: 'ACTIVE' })
    )
    const taskDefinitions = []
    for (const arn of taskDefinitionArns.taskDefinitionArns || []) {
      const taskDefinition = await this.memoClient.send(
        new DescribeTaskDefinitionCommand({ taskDefinition: arn })
      )
      taskDefinitions.push(taskDefinition.taskDefinition!)
    }
    return taskDefinitions
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const taskDefinitions = await this.getTaskDefinitions()

    for (const taskDefinition of taskDefinitions) {
      if (taskDefinition.networkMode === 'awsvpc') {
        compliantResources.push(taskDefinition.taskDefinitionArn!)
      } else {
        nonCompliantResources.push(taskDefinition.taskDefinitionArn!)
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
      const taskDefinition = await this.memoClient.send(
        new DescribeTaskDefinitionCommand({ taskDefinition: arn })
      )
      const family = taskDefinition.taskDefinition?.family

      await this.client.send(
        new RegisterTaskDefinitionCommand({
          family,
          containerDefinitions: taskDefinition.taskDefinition?.containerDefinitions,
          networkMode: 'awsvpc',
          requiresCompatibilities: taskDefinition.taskDefinition?.requiresCompatibilities,
          cpu: taskDefinition.taskDefinition?.cpu,
          memory: taskDefinition.taskDefinition?.memory
        })
      )
    }
  }
}
