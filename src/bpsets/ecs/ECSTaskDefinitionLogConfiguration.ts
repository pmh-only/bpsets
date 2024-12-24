import {
  ECSClient,
  ListTaskDefinitionsCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand
} from '@aws-sdk/client-ecs'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class ECSTaskDefinitionLogConfiguration implements BPSet {
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
      const logDisabledContainers = taskDefinition.containerDefinitions?.filter(
        container => !container.logConfiguration
      )
      if (logDisabledContainers?.length) {
        nonCompliantResources.push(taskDefinition.taskDefinitionArn!)
      } else {
        compliantResources.push(taskDefinition.taskDefinitionArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'log-configuration' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const logConfiguration = requiredParametersForFix.find(
      param => param.name === 'log-configuration'
    )?.value

    if (!logConfiguration) {
      throw new Error("Required parameter 'log-configuration' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const taskDefinition = await this.memoClient.send(
        new DescribeTaskDefinitionCommand({ taskDefinition: arn })
      )
      const family = taskDefinition.taskDefinition?.family

      const updatedContainers = taskDefinition.taskDefinition?.containerDefinitions?.map(
        container => ({
          ...container,
          logConfiguration: JSON.parse(logConfiguration)
        })
      )

      await this.client.send(
        new RegisterTaskDefinitionCommand({
          family,
          containerDefinitions: updatedContainers,
          networkMode: taskDefinition.taskDefinition?.networkMode,
          requiresCompatibilities: taskDefinition.taskDefinition?.requiresCompatibilities,
          cpu: taskDefinition.taskDefinition?.cpu,
          memory: taskDefinition.taskDefinition?.memory
        })
      )
    }
  }
}
