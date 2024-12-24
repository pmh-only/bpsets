import {
  EC2Client,
  DescribeTransitGatewaysCommand,
  ModifyTransitGatewayCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2TransitGatewayAutoVPCAttachDisabled implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []

    const response = await this.memoClient.send(new DescribeTransitGatewaysCommand({}))
    const transitGateways = response.TransitGateways || []

    for (const gateway of transitGateways) {
      if (gateway.Options?.AutoAcceptSharedAttachments === 'enable') {
        nonCompliantResources.push(gateway.TransitGatewayArn!)
      } else {
        compliantResources.push(gateway.TransitGatewayArn!)
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
      const transitGatewayId = arn.split(':transit-gateway/')[1]

      await this.client.send(
        new ModifyTransitGatewayCommand({
          TransitGatewayId: transitGatewayId,
          Options: {
            AutoAcceptSharedAttachments: 'disable'
          }
        })
      )
    }
  }
}
