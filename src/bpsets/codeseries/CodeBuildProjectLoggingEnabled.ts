import {
  CodeBuildClient,
  ListProjectsCommand,
  BatchGetProjectsCommand,
  UpdateProjectCommand
} from '@aws-sdk/client-codebuild'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class CodeBuildProjectLoggingEnabled implements BPSet {
  private readonly client = new CodeBuildClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getProjects = async () => {
    const projectNames = await this.memoClient.send(new ListProjectsCommand({}))
    if (!projectNames.projects?.length) {
      return []
    }
    const response = await this.memoClient.send(
      new BatchGetProjectsCommand({ names: projectNames.projects })
    )
    return response.projects || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const projects = await this.getProjects()

    for (const project of projects) {
      const logsConfig = project.logsConfig
      if (
        logsConfig?.cloudWatchLogs?.status === 'ENABLED' ||
        logsConfig?.s3Logs?.status === 'ENABLED'
      ) {
        compliantResources.push(project.arn!)
      } else {
        nonCompliantResources.push(project.arn!)
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
      const projectName = arn.split(':').pop()!
      const projects = await this.getProjects()
      const projectToFix = projects.find(project => project.arn === arn)

      if (!projectToFix) {
        continue
      }

      await this.client.send(
        new UpdateProjectCommand({
          name: projectName,
          logsConfig: {
            ...projectToFix.logsConfig,
            cloudWatchLogs: {
              status: 'ENABLED',
              groupName: 'default-cloudwatch-group',
              streamName: 'default-stream'
            }
          }
        })
      )
    }
  }
}
