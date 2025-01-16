import {
  CodeBuildClient,
  ListProjectsCommand,
  BatchGetProjectsCommand,
  UpdateProjectCommand
} from '@aws-sdk/client-codebuild'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CodeBuildProjectEnvironmentPrivilegedCheck implements BPSet {
  private readonly client = new CodeBuildClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getProjects = async () => {
    const projectNames = await this.memoClient.send(new ListProjectsCommand({}))
    if (!projectNames.projects?.length) {
      return []
    }
    const response = await this.memoClient.send(new BatchGetProjectsCommand({ names: projectNames.projects }))
    return response.projects || []
  }

  public readonly getMetadata = () => ({
    name: 'CodeBuildProjectEnvironmentPrivilegedCheck',
    description: 'Ensures that AWS CodeBuild projects are not using privileged mode for their environment.',
    priority: 3,
    priorityReason: 'Privileged mode in CodeBuild environments increases the risk of unauthorized access and actions.',
    awsService: 'CodeBuild',
    awsServiceCategory: 'Build',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListProjectsCommand',
        reason: 'Retrieve all CodeBuild projects to verify environment settings.'
      },
      {
        name: 'BatchGetProjectsCommand',
        reason: 'Fetch detailed configuration for each CodeBuild project.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateProjectCommand',
        reason: 'Update the project to disable privileged mode in the environment settings.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the privileged mode is not required for any valid use case before applying fixes.'
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
    const projects = await this.getProjects()

    for (const project of projects) {
      if (!project.environment?.privilegedMode) {
        compliantResources.push(project.arn!)
      } else {
        nonCompliantResources.push(project.arn!)
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    const projects = await this.getProjects()

    for (const arn of nonCompliantResources) {
      const projectName = arn.split(':').pop()!
      const projectToFix = projects.find((project) => project.arn === arn)

      if (!projectToFix) {
        continue
      }

      await this.client.send(
        new UpdateProjectCommand({
          name: projectName,
          environment: {
            ...projectToFix.environment,
            privilegedMode: false
          } as unknown
        })
      )
    }
  }
}
