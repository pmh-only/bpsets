import {
  SecurityHubClient,
  DescribeHubCommand,
  EnableSecurityHubCommand
} from '@aws-sdk/client-securityhub'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class SecurityHubEnabled implements BPSet {
  private readonly securityHubClient = new SecurityHubClient({})
  private readonly stsClient = new STSClient({})
  private readonly memoSecurityHubClient = Memorizer.memo(this.securityHubClient)
  private readonly memoStsClient = Memorizer.memo(this.stsClient)

  private readonly getAWSAccountId = async () => {
    const response = await this.memoStsClient.send(new GetCallerIdentityCommand({}))
    return response.Account!
  }

  public readonly check = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const awsAccountId = await this.getAWSAccountId()

    try {
      await this.memoSecurityHubClient.send(new DescribeHubCommand({}))
      compliantResources.push(awsAccountId)
    } catch (error: any) {
      if (error.name === 'InvalidAccessException') {
        nonCompliantResources.push(awsAccountId)
      } else {
        throw error
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const accountId of nonCompliantResources) {
      if (accountId) {
        await this.securityHubClient.send(new EnableSecurityHubCommand({}))
      }
    }
  }
}
