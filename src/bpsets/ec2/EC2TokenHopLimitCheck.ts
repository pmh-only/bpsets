import {
  EC2Client,
  DescribeInstancesCommand,
  ModifyInstanceMetadataOptionsCommand,
} from '@aws-sdk/client-ec2';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class EC2TokenHopLimitCheck implements BPSet {
  private readonly client = new EC2Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  public readonly getMetadata = () => ({
    name: 'EC2TokenHopLimitCheck',
    description: 'Ensures that EC2 instances have a Metadata Options HttpPutResponseHopLimit of 1.',
    priority: 3,
    priorityReason:
      'Setting the HttpPutResponseHopLimit to 1 ensures secure access to the instance metadata.',
    awsService: 'EC2',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeInstancesCommand',
        reason: 'Retrieve EC2 instances and check the metadata options for HttpPutResponseHopLimit.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyInstanceMetadataOptionsCommand',
        reason: 'Update the HttpPutResponseHopLimit to enforce secure metadata access.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure modifying instance metadata options aligns with your operational policies.',
  });

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const response = await this.memoClient.send(new DescribeInstancesCommand({}));

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (
          instance.MetadataOptions?.HttpPutResponseHopLimit &&
          instance.MetadataOptions.HttpPutResponseHopLimit < 2
        ) {
          compliantResources.push(instance.InstanceId!);
        } else {
          nonCompliantResources.push(instance.InstanceId!);
        }
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const instanceId of nonCompliantResources) {
      await this.client.send(
        new ModifyInstanceMetadataOptionsCommand({
          InstanceId: instanceId,
          HttpPutResponseHopLimit: 1,
        })
      );
    }
  };
}
