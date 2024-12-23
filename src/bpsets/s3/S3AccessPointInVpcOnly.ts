import {
  S3ControlClient,
  ListAccessPointsCommand,
  DeleteAccessPointCommand,
  CreateAccessPointCommand
} from '@aws-sdk/client-s3-control'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class S3AccessPointInVpcOnly implements BPSet {
  private readonly client = new S3ControlClient({})
  private readonly memoClient = Memorizer.memo(this.client)
  private readonly stsClient = Memorizer.memo(new STSClient({}))

  private readonly getAccountId = async (): Promise<string> => {
    const response = await this.stsClient.send(new GetCallerIdentityCommand({}))
    return response.Account!
  }

  public readonly check = async (): Promise<{
    compliantResources: string[]
    nonCompliantResources: string[]
    requiredParametersForFix: { name: string }[]
  }> => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const requiredParametersForFix = [{ name: 'your-vpc-id' }]

    const accountId = await this.getAccountId()

    const response = await this.memoClient.send(
      new ListAccessPointsCommand({ AccountId: accountId })
    )

    for (const accessPoint of response.AccessPointList || []) {
      if (accessPoint.NetworkOrigin === 'VPC') {
        compliantResources.push(accessPoint.AccessPointArn!)
      } else {
        nonCompliantResources.push(accessPoint.AccessPointArn!)
      }
    }

    return { compliantResources, nonCompliantResources, requiredParametersForFix }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    const accountId = await this.getAccountId()
    const vpcId = requiredParametersForFix.find(param => param.name === 'your-vpc-id')?.value

    if (!vpcId) {
      throw new Error("Required parameter 'your-vpc-id' is missing.")
    }

    for (const accessPointArn of nonCompliantResources) {
      const accessPointName = accessPointArn.split(':').pop()!
      const bucketName = accessPointArn.split('/')[1]!

      await this.client.send(
        new DeleteAccessPointCommand({
          AccountId: accountId,
          Name: accessPointName
        })
      )

      await this.client.send(
        new CreateAccessPointCommand({
          AccountId: accountId,
          Name: accessPointName,
          Bucket: bucketName,
          VpcConfiguration: {
            VpcId: vpcId
          }
        })
      )
    }
  }
}
