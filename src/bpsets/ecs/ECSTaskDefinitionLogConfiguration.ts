import {
  ECSClient,
  ListTaskDefinitionsCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand
} from '@aws-sdk/client-ecs'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECSTaskDefinitionLogConfiguration implements BPSet {
  private readonly client = new ECSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getTaskDefinitions = async () => {
    const taskDefinitionArns = await this.memoClient.send(new ListTaskDefinitionsCommand({ status: 'ACTIVE' }))
    const taskDefinitions = []
    for (const arn of taskDefinitionArns.taskDefinitionArns || []) {
      const taskDefinition = await this.memoClient.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }))
      taskDefinitions.push(taskDefinition.taskDefinition!)
    }
    return taskDefinitions
  }

  public readonly getMetadata = () => ({
    name: 'ECSTaskDefinitionLogConfiguration',
    description: 'Ensures that ECS task definitions have log configuration enabled.',
    priority: 1,
    priorityReason: 'Enabling log configuration is critical for monitoring and debugging container workloads.',
    awsService: 'ECS',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Monitoring',
    requiredParametersForFix: [
      {
        name: 'log-configuration',
        description: 'The log configuration to apply to non-compliant task definitions.',
        default: '{}',
        example: '{"logDriver": "awslogs", "options": {"awslogs-group": "/ecs/logs"}}'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTaskDefinitionsCommand',
        reason: 'Retrieve all active ECS task definitions.'
      },
      {
        name: 'DescribeTaskDefinitionCommand',
        reason: 'Check the container configurations in ECS task definitions.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RegisterTaskDefinitionCommand',
        reason: 'Re-register ECS task definitions with updated log configuration.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the provided log configuration aligns with your logging strategy and infrastructure.'
  })

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const taskDefinitions = await this.getTaskDefinitions()

    for (const taskDefinition of taskDefinitions) {
      const logDisabledContainers = taskDefinition.containerDefinitions?.filter(
        (container) => !container.logConfiguration
      )
      if (logDisabledContainers?.length) {
        nonCompliantResources.push(taskDefinition.taskDefinitionArn!)
      } else {
        compliantResources.push(taskDefinition.taskDefinitionArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const logConfiguration = requiredParametersForFix.find((param) => param.name === 'log-configuration')?.value

    if (!logConfiguration) {
      throw new Error("Required parameter 'log-configuration' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const taskDefinition = await this.memoClient.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }))
      const family = taskDefinition.taskDefinition?.family

      const updatedContainers = taskDefinition.taskDefinition?.containerDefinitions?.map((container) => ({
        ...container,
        logConfiguration: JSON.parse(logConfiguration)
      }))

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
