export interface IntroductionEmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface IntroductionDelivery {
  staffEmail: string;
  staffName: string;
  memberEmail: string;
  memberName: string;
  title: string;
  purpose: string;
  requestedHelp: string;
}

export type IntroductionClaim =
  | {
      id: string;
      action: "send";
      staffEmail?: string | null;
      memberEmail?: string | null;
    }
  | {
      id: string;
      action: "evidence";
      staffEmail: string;
      memberEmail: string;
      providerMessageId: string | null;
    }
  | { id: string; action: "blocked" };

export interface IntroductionDeliveryRepository {
  reconcile(): Promise<unknown>;
  beginIntroductionDelivery(
    requestId: string,
    now: string,
    initiatingCoordinatorId: string | null,
    provider: boolean
  ): Promise<IntroductionClaim | undefined>;
  introductionDelivery(id: string): Promise<IntroductionDelivery | undefined>;
  confirmIntroductionDelivery(
    id: string,
    staffEmail: string,
    memberEmail: string,
    initiatingCoordinatorId: string | null
  ): Promise<boolean>;
  markIntroductionAccepted(id: string, providerMessageId: string): Promise<boolean>;
  markIntroductionFailed(id: string): Promise<boolean>;
  markIntroductionAmbiguous(id: string): Promise<boolean>;
  markIntroductionShared(id: string, staffEmail: string): Promise<boolean>;
  captureIntroduction(
    id: string,
    message: IntroductionEmailMessage,
    initiatingCoordinatorId: string | null
  ): Promise<boolean>;
  releaseIntroduction(id: string): Promise<unknown>;
  hasPendingIntroduction(requestId: string): Promise<boolean>;
}

export interface IntroductionSendOptions {
  idempotencyKey: string;
  localCapture: () => Promise<boolean>;
  useProvider: boolean;
}

export interface IntroductionSendResult {
  delivered: boolean;
  transport: "local" | "resend";
  messageId?: string;
}

export interface DeliverIntroductionInput {
  requestId: string;
  initiatingCoordinatorId: string | null;
  now: string;
  provider: boolean;
  repository: IntroductionDeliveryRepository;
  send: (
    message: IntroductionEmailMessage,
    options: IntroductionSendOptions
  ) => Promise<IntroductionSendResult>;
}

export async function deliverIntroductionAttempt(
  input: DeliverIntroductionInput
): Promise<{ shared: boolean; pending: boolean; attention: boolean }> {
  const repository = input.repository;
  await repository.reconcile();
  const claim = await repository.beginIntroductionDelivery(
    input.requestId,
    input.now,
    input.initiatingCoordinatorId,
    input.provider
  );
  if (!claim)
    return {
      shared: false,
      pending: await repository.hasPendingIntroduction(input.requestId),
      attention: false,
    };
  if (claim.action === "blocked") return { shared: false, pending: false, attention: true };
  if (claim.action === "evidence") {
    try {
      const shared = await repository.markIntroductionShared(claim.id, claim.staffEmail);
      return { shared, pending: false, attention: !shared };
    } catch {
      return { shared: false, pending: false, attention: true };
    }
  }

  const delivery = await repository.introductionDelivery(claim.id);
  if (!delivery) {
    await repository.releaseIntroduction(claim.id);
    return {
      shared: false,
      pending: await repository.hasPendingIntroduction(input.requestId),
      attention: false,
    };
  }
  const staffEmail = claim.staffEmail ?? delivery.staffEmail;
  const memberEmail = claim.memberEmail ?? delivery.memberEmail;
  const message: IntroductionEmailMessage = {
    to: staffEmail,
    subject: `Perkenalan alumni: ${delivery.title}`,
    text: `Kepada ${delivery.staffName},\n\n${delivery.memberName} (${memberEmail}) menyetujui emailnya dibagikan kepada Anda untuk kebutuhan sekolah berikut.\n\nKebutuhan: ${delivery.title}\nTujuan sekolah: ${delivery.purpose}\nBantuan yang diminta: ${delivery.requestedHelp}\n\nAlumni tersebut telah memberikan persetujuan eksplisit untuk perkenalan ini. Silakan hubungi langsung melalui email di atas.`,
  };

  if (input.provider) {
    const confirmed = await repository.confirmIntroductionDelivery(
      claim.id,
      staffEmail,
      memberEmail,
      input.initiatingCoordinatorId
    );
    if (!confirmed) {
      await repository.markIntroductionFailed(claim.id);
      await repository.releaseIntroduction(claim.id);
      return {
        shared: false,
        pending: await repository.hasPendingIntroduction(input.requestId),
        attention: false,
      };
    }
  }

  let result: IntroductionSendResult;
  try {
    result = await input.send(message, {
      idempotencyKey: `outreach-introduction:${claim.id}`,
      localCapture: () =>
        repository.captureIntroduction(claim.id, message, input.initiatingCoordinatorId),
      useProvider: input.provider,
    });
  } catch (error) {
    if (input.provider && error instanceof Error && "ambiguous" in error && error.ambiguous) {
      await repository.markIntroductionAmbiguous(claim.id);
      return { shared: false, pending: false, attention: true };
    }
    await repository.markIntroductionFailed(claim.id);
    await repository.releaseIntroduction(claim.id);
    return {
      shared: false,
      pending: await repository.hasPendingIntroduction(input.requestId),
      attention: false,
    };
  }

  if (!result.delivered) {
    await repository.releaseIntroduction(claim.id);
    return {
      shared: false,
      pending: await repository.hasPendingIntroduction(input.requestId),
      attention: false,
    };
  }
  if (result.transport === "local") return { shared: true, pending: false, attention: false };

  try {
    if (!result.messageId) throw new Error("missing provider message id");
    const accepted = await repository.markIntroductionAccepted(claim.id, result.messageId);
    if (!accepted) throw new Error("attempt not accepted");
    const shared = await repository.markIntroductionShared(claim.id, staffEmail);
    return { shared, pending: false, attention: !shared };
  } catch {
    return { shared: false, pending: false, attention: true };
  }
}
