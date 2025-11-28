import { FLOW_SEQUENCES, type SlideId } from '@app/components/onboarding/onboardingFlowConfig';

export type FlowType = 'login-admin' | 'login-user' | 'no-login' | 'no-login-admin';

export interface FlowConfig {
  type: FlowType;
  ids: SlideId[];
}

export function resolveFlow(enableLogin: boolean, isAdmin: boolean, selfReportedAdmin: boolean): FlowConfig {
  if (!enableLogin) {
    return selfReportedAdmin
      ? {
          type: 'no-login-admin',
          ids: [...FLOW_SEQUENCES.noLoginBase, ...FLOW_SEQUENCES.noLoginAdmin],
        }
      : {
          type: 'no-login',
          ids: FLOW_SEQUENCES.noLoginBase,
        };
  }

  return isAdmin
    ? {
        type: 'login-admin',
        ids: FLOW_SEQUENCES.loginAdmin,
      }
    : {
        type: 'login-user',
        ids: FLOW_SEQUENCES.loginUser,
      };
}

