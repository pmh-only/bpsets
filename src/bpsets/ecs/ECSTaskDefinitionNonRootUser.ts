import {
  ECSClient,
  ListTaskDefinitionsCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand
} from '@aws-sdk/client-ecs'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECSTaskDefinitionNonRootUser implements BPSet {
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
    name: 'ECSTaskDefinitionNonRootUser',
    description: 'Ensures all ECS containers in task definitions run as non-root users.',
    priority: 1,
    priorityReason:
      'Running containers as non-root users improves security by reducing the potential impact of compromised containers.',
    awsService: 'ECS',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'default-non-root-user',
        description: 'The default non-root user to assign for containers without a specified user.',
        default: 'ecs-user',
        example: 'app-user'
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
        reason: 'Check container configurations in ECS task definitions for user settings.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RegisterTaskDefinitionCommand',
        reason: 'Re-register ECS task definitions with non-root user configurations.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the default non-root user has sufficient permissions to execute the container workload.'
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
      const privilegedContainers = taskDefinition.containerDefinitions?.filter(
        (container) => !container.user || container.user === 'root'
      )
      if (privilegedContainers?.length) {
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
    const defaultNonRootUser =
      requiredParametersForFix.find((param) => param.name === 'default-non-root-user')?.value || 'ecs-user'

    for (const arn of nonCompliantResources) {
      const taskDefinition = await this.memoClient.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }))
      const family = taskDefinition.taskDefinition?.family

      const updatedContainers = taskDefinition.taskDefinition?.containerDefinitions?.map((container) => ({
        ...container,
        user: container.user || defaultNonRootUser
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
