import type {
  IrrigationAlert,
  IrrigationSystemState,
  IrrigationZone,
  MoistureForecastPoint,
} from '../src/types/agri.ts';

interface InternalZone extends IrrigationZone {
  evapPerHourPct: number;
  infiltrationPerHourPct: number;
  pulseRemainingTicks: number;
}

const initialZones: InternalZone[] = [
  {
    id: 'zone-a',
    name: 'Zone A · North Drip Block',
    crop: 'Tomato (Roma)',
    areaHectares: 2.4,
    lat: 20.0145,
    lng: 73.7885,
    moisturePct: 48.6,
    soilTempC: 23.4,
    ecDsM: 1.42,
    flowRateLpm: 0,
    minThresholdPct: 40,
    targetMoisturePct: 62,
    valveOpen: false,
    mode: 'AUTO_ML',
    hoursUntilThreshold: 6.2,
    status: 'Optimal',
    forecast24h: [],
    lastUpdated: new Date().toISOString(),
    evapPerHourPct: 1.35,
    infiltrationPerHourPct: 8.8,
    pulseRemainingTicks: 0,
  },
  {
    id: 'zone-b',
    name: 'Zone B · Orchard Terrace',
    crop: 'Pomegranate',
    areaHectares: 3.1,
    lat: 20.0112,
    lng: 73.7942,
    moisturePct: 34.2,
    soilTempC: 25.8,
    ecDsM: 1.18,
    flowRateLpm: 145,
    minThresholdPct: 36,
    targetMoisturePct: 58,
    valveOpen: true,
    mode: 'AUTO_ML',
    hoursUntilThreshold: 0,
    status: 'Irrigating',
    forecast24h: [],
    lastUpdated: new Date().toISOString(),
    evapPerHourPct: 1.15,
    infiltrationPerHourPct: 7.4,
    pulseRemainingTicks: 0,
  },
  {
    id: 'zone-c',
    name: 'Zone C · Greenhouse Nursery',
    crop: 'Bell Pepper Seedlings',
    areaHectares: 0.8,
    lat: 20.0086,
    lng: 73.7871,
    moisturePct: 56.4,
    soilTempC: 21.9,
    ecDsM: 1.65,
    flowRateLpm: 0,
    minThresholdPct: 48,
    targetMoisturePct: 68,
    valveOpen: false,
    mode: 'AUTO_ML',
    hoursUntilThreshold: 7.6,
    status: 'Optimal',
    forecast24h: [],
    lastUpdated: new Date().toISOString(),
    evapPerHourPct: 1.1,
    infiltrationPerHourPct: 10.5,
    pulseRemainingTicks: 0,
  },
  {
    id: 'zone-d',
    name: 'Zone D · South Furrow Plot',
    crop: 'Onion (Rabi)',
    areaHectares: 2.9,
    lat: 20.0074,
    lng: 73.7938,
    moisturePct: 33.8,
    soilTempC: 26.5,
    ecDsM: 1.31,
    flowRateLpm: 0,
    minThresholdPct: 38,
    targetMoisturePct: 56,
    valveOpen: false,
    mode: 'MANUAL',
    hoursUntilThreshold: 0,
    status: 'Moisture Low',
    forecast24h: [],
    lastUpdated: new Date().toISOString(),
    evapPerHourPct: 1.45,
    infiltrationPerHourPct: 7.2,
    pulseRemainingTicks: 0,
  },
];

function computeRegressionForecast(z: InternalZone): {
  forecast24h: MoistureForecastPoint[];
  hoursUntilThreshold: number | null;
} {
  const points: MoistureForecastPoint[] = [];
  let simMoisture = z.moisturePct;
  let simValve = z.valveOpen;
  let hoursUntilThreshold: number | null = z.moisturePct <= z.minThresholdPct ? 0 : null;

  for (let h = 0; h <= 24; h += 2) {
    const uncertainty = 0.6 + h * 0.14;
    points.push({
      hourOffset: h,
      label: h === 0 ? 'Now' : `+${h}h`,
      predictedMoisturePct: Number(simMoisture.toFixed(1)),
      lowerBoundPct: Number(Math.max(10, simMoisture - uncertainty).toFixed(1)),
      upperBoundPct: Number(Math.min(90, simMoisture + uncertainty).toFixed(1)),
    });

    if (hoursUntilThreshold === null && simMoisture <= z.minThresholdPct) {
      hoursUntilThreshold = h;
    }

    // Step forward 2 hours under regression model (diurnal solar ET curve)
    const diurnalFactor = 0.85 + 0.35 * Math.sin(((new Date().getHours() + h) / 24) * Math.PI * 2);
    if (simValve) {
      simMoisture = Math.min(z.targetMoisturePct + 1.5, simMoisture + (z.infiltrationPerHourPct - z.evapPerHourPct * 0.4) * 2);
      if (simMoisture >= z.targetMoisturePct) {
        simValve = false;
      }
    } else {
      simMoisture = Math.max(12, simMoisture - z.evapPerHourPct * diurnalFactor * 2);
      if (z.mode === 'AUTO_ML' && simMoisture <= z.minThresholdPct) {
        simValve = true;
      }
    }
  }

  return { forecast24h: points, hoursUntilThreshold };
}

function deriveStatus(z: InternalZone): IrrigationZone['status'] {
  if (z.valveOpen) return 'Irrigating';
  if (z.moisturePct <= z.minThresholdPct - 6) return 'Critical Stress';
  if (z.moisturePct <= z.minThresholdPct) return 'Moisture Low';
  return 'Optimal';
}

export class IrrigationControllerEngine {
  private zones: InternalZone[] = initialZones;
  private alerts: IrrigationAlert[] = [
    {
      id: 'init-alert-1',
      zoneId: 'zone-b',
      zoneName: 'Zone B · Orchard Terrace',
      severity: 'info',
      message: 'ML moisture forecast crossed 36% threshold; drip manifold opened automatically.',
      timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
    {
      id: 'init-alert-2',
      zoneId: 'zone-d',
      zoneName: 'Zone D · South Furrow Plot',
      severity: 'warning',
      message: 'Moisture at 33.8% (below 38% target). Manual mode active — operator approval needed.',
      timestamp: new Date(Date.now() - 90 * 1000).toISOString(),
    },
  ];
  private dailyWaterLitres = 4280;
  private connectedClients = 0;

  constructor() {
    this.recomputeForecasts();
  }

  private recomputeForecasts(): void {
    const now = new Date().toISOString();
    for (const z of this.zones) {
      const { forecast24h, hoursUntilThreshold } = computeRegressionForecast(z);
      z.forecast24h = forecast24h;
      z.hoursUntilThreshold = hoursUntilThreshold;
      z.status = deriveStatus(z);
      z.flowRateLpm = z.valveOpen ? Math.round(z.areaHectares * 46 + (z.id === 'zone-c' ? 40 : 0)) : 0;
      z.lastUpdated = now;
    }
  }

  public setClientCount(count: number): void {
    this.connectedClients = count;
  }

  public getState(): IrrigationSystemState {
    const publicZones: IrrigationZone[] = this.zones.map(
      ({ evapPerHourPct: _e, infiltrationPerHourPct: _i, pulseRemainingTicks: _p, ...rest }) => rest
    );
    const totalFlowLpm = publicZones.reduce((acc, z) => acc + z.flowRateLpm, 0);
    return {
      zones: publicZones,
      alerts: this.alerts.slice(0, 12),
      totalFlowLpm,
      dailyWaterLitres: Math.round(this.dailyWaterLitres),
      waterSavedPct: 28,
      connectedClients: this.connectedClients,
      serverTime: new Date().toISOString(),
    };
  }

  private pushAlert(zone: InternalZone, severity: IrrigationAlert['severity'], message: string): IrrigationAlert {
    const alert: IrrigationAlert = {
      id: `al-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      zoneId: zone.id,
      zoneName: zone.name,
      severity,
      message,
      timestamp: new Date().toISOString(),
    };
    this.alerts.unshift(alert);
    this.alerts = this.alerts.slice(0, 20);
    return alert;
  }

  public tick(): { state: IrrigationSystemState; newAlerts: IrrigationAlert[] } {
    const newAlerts: IrrigationAlert[] = [];
    // Each tick represents ~3 simulated minutes of soil dynamics so operators see live movement
    const simHours = 0.05;

    for (const z of this.zones) {
      const microNoise = (Math.random() - 0.5) * 0.14;
      if (z.valveOpen) {
        z.moisturePct = Math.min(78, Number((z.moisturePct + z.infiltrationPerHourPct * simHours + microNoise * 0.4).toFixed(1)));
        z.soilTempC = Number(Math.max(18, z.soilTempC - 0.05).toFixed(1));
        this.dailyWaterLitres += (z.flowRateLpm * 2.5) / 60;

        if (z.pulseRemainingTicks > 0) {
          z.pulseRemainingTicks -= 1;
          if (z.pulseRemainingTicks === 0) {
            z.valveOpen = false;
            newAlerts.push(this.pushAlert(z, 'info', 'Scheduled 15-minute hydration pulse completed; valve closed.'));
          }
        } else if (z.mode === 'AUTO_ML' && z.moisturePct >= z.targetMoisturePct) {
          z.valveOpen = false;
          newAlerts.push(
            this.pushAlert(z, 'info', `Target moisture (${z.targetMoisturePct}%) reached; ML controller closed valve to prevent runoff.`)
          );
        }
      } else {
        z.moisturePct = Math.max(16, Number((z.moisturePct - z.evapPerHourPct * simHours + microNoise).toFixed(1)));
        z.soilTempC = Number(Math.min(34, z.soilTempC + 0.03).toFixed(1));

        if (z.mode === 'AUTO_ML' && z.moisturePct <= z.minThresholdPct) {
          z.valveOpen = true;
          newAlerts.push(
            this.pushAlert(z, 'info', `Moisture fell to ${z.moisturePct}% (threshold ${z.minThresholdPct}%); AUTO_ML started irrigation.`)
          );
        } else if (z.mode === 'MANUAL' && z.moisturePct <= z.minThresholdPct && Math.random() < 0.08) {
          newAlerts.push(
            this.pushAlert(z, 'warning', `Moisture at ${z.moisturePct}% below ${z.minThresholdPct}% threshold (Manual Mode).`)
          );
        }
      }
    }

    this.recomputeForecasts();
    return { state: this.getState(), newAlerts };
  }

  public applyCommand(cmd: {
    type: string;
    zoneId?: string;
    valveOpen?: boolean;
    mode?: 'AUTO_ML' | 'MANUAL';
    minThresholdPct?: number;
  }): { ok: boolean; error?: string } {
    const zone = this.zones.find((z) => z.id === cmd.zoneId);
    if (!zone) {
      return { ok: false, error: 'Unknown irrigation zone ID.' };
    }

    if (cmd.type === 'zone:toggle_valve') {
      const nextValve = typeof cmd.valveOpen === 'boolean' ? cmd.valveOpen : !zone.valveOpen;
      zone.valveOpen = nextValve;
      zone.pulseRemainingTicks = 0;
      this.pushAlert(
        zone,
        'info',
        `Operator ${nextValve ? 'opened' : 'closed'} solenoid valve (${zone.mode === 'AUTO_ML' ? 'manual override' : 'manual control'}).`
      );
    } else if (cmd.type === 'zone:set_mode' && (cmd.mode === 'AUTO_ML' || cmd.mode === 'MANUAL')) {
      zone.mode = cmd.mode;
      this.pushAlert(
        zone,
        'info',
        `Switched control loop to ${cmd.mode === 'AUTO_ML' ? 'ML Regression Auto-Schedule' : 'Manual Operator Control'}.`
      );
    } else if (cmd.type === 'zone:set_threshold' && typeof cmd.minThresholdPct === 'number') {
      const clamped = Math.min(60, Math.max(20, Math.round(cmd.minThresholdPct)));
      zone.minThresholdPct = clamped;
      zone.targetMoisturePct = Math.min(78, clamped + 20);
      this.pushAlert(zone, 'info', `Updated moisture trigger threshold to ${clamped}% (target ${zone.targetMoisturePct}%).`);
    } else if (cmd.type === 'zone:pulse_15m') {
      zone.valveOpen = true;
      zone.pulseRemainingTicks = 6;
      this.pushAlert(zone, 'info', 'Started 15-minute metered hydration pulse.');
    } else {
      return { ok: false, error: 'Unsupported command type.' };
    }

    this.recomputeForecasts();
    return { ok: true };
  }
}
