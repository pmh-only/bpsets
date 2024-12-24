import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand
} from '@aws-sdk/client-cloudwatch'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class CloudWatchAlarmSettingsCheck implements BPSet {
  private readonly client = new CloudWatchClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getAlarms = async () => {
    const response = await this.memoClient.send(new DescribeAlarmsCommand({}))
    return response.MetricAlarms || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const parameters = {
      MetricName: '', // Required
      Threshold: null,
      EvaluationPeriods: null,
      Period: null,
      ComparisonOperator: null,
      Statistic: null
    }

    const alarms = await this.getAlarms()

    for (const alarm of alarms) {
      for (const parameter of Object.keys(parameters).filter(key => (parameters as any)[key] !== null)) {
        if (alarm.MetricName !== parameters.MetricName) {
          continue
        }

        if (alarm[parameter as keyof typeof alarm] !== parameters[parameter as keyof typeof parameters]) {
          nonCompliantResources.push(alarm.AlarmArn!)
          break
        }
      }

      compliantResources.push(alarm.AlarmArn!)
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'metric-name' },
        { name: 'threshold' },
        { name: 'evaluation-periods' },
        { name: 'period' },
        { name: 'comparison-operator' },
        { name: 'statistic' }
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const requiredSettings = Object.fromEntries(
      requiredParametersForFix.map(param => [param.name, param.value])
    )

    for (const alarmArn of nonCompliantResources) {
      const alarmName = alarmArn.split(':').pop()!

      await this.client.send(
        new PutMetricAlarmCommand({
          AlarmName: alarmName,
          MetricName: requiredSettings['metric-name'],
          Threshold: parseFloat(requiredSettings['threshold']),
          EvaluationPeriods: parseInt(requiredSettings['evaluation-periods'], 10),
          Period: parseInt(requiredSettings['period'], 10),
          ComparisonOperator: requiredSettings['comparison-operator'] as any,
          Statistic: requiredSettings['statistic'] as any
        })
      )
    }
  }
}
