import { describe, expect, it } from "vitest";
import fixtures from "./client-feature-contract-v1.fixture.json";
import {
  assertClientFeatureBootstrap,
  type ClientFeatureId,
} from "./bootstrapContract";

describe("client feature bootstrap contract v1", () => {
  it("accepts the shared valid fixtures", () => {
    for (const fixture of fixtures.valid) {
      expect(() =>
        assertClientFeatureBootstrap(
          fixture.value,
          fixture.featureId as ClientFeatureId
        )
      ).not.toThrow();
    }
  });

  it("rejects the shared invalid fixtures", () => {
    for (const fixture of fixtures.invalid) {
      expect(
        () =>
          assertClientFeatureBootstrap(
            fixture.value,
            fixture.featureId as ClientFeatureId
          ),
        fixture.name
      ).toThrow();
    }
  });

  const runtime = { version: 1, ownerId: 'owner', contextId: 'context', epoch: 2, summaryAttention: 'disabled' };
  const ownerCutover = { version: 1, ownerCutoverVersion: 1, ownerId: 'owner', contextId: 'context', epoch: 2, bindingId: 'view' };
  const communication = fixtures.valid.find(fixture => fixture.featureId === 'communication')!.value;

  it('accepts a cutover binding only with the exact Communication runtime', () => {
    expect(() => assertClientFeatureBootstrap({ ...communication, runtime, ownerCutover }, 'communication')).not.toThrow();
    expect(() => assertClientFeatureBootstrap({ ...communication, ownerCutover }, 'communication')).toThrow();
    expect(() => assertClientFeatureBootstrap({ ...communication, runtime, ownerCutover: { ...ownerCutover, epoch: 3 } }, 'communication')).toThrow();
  });

  it.each(['ownerId', 'contextId', 'bindingId', 'ownerCutoverVersion'])(
    'rejects an invalid owner binding %s', field => {
      expect(() => assertClientFeatureBootstrap({ ...communication, runtime,
        ownerCutover: { ...ownerCutover, [field]: field === 'ownerCutoverVersion' ? 2 : '' },
      }, 'communication')).toThrow();
    },
  );

  it('rejects cutover credentials and capability on another feature', () => {
    expect(() => assertClientFeatureBootstrap({ ...communication, runtime,
      ownerCutover: { ...ownerCutover, token: 'unexpected' },
    }, 'communication')).toThrow();
    const summary = fixtures.valid.find(fixture => fixture.featureId === 'summary')!.value;
    expect(() => assertClientFeatureBootstrap({ ...summary, ownerCutover }, 'summary')).toThrow();
  });
});
