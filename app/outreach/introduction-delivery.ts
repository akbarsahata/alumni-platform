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

export interface IntroductionDeliveryRepository {
  reconcile(): Promise<unknown>;
  claimIntroduction(
    requestId: string,
    now: string,
    initiatingCoordinatorId: string | null
  ): Promise<{ id: string } | undefined>;
  introductionDelivery(id: string): Promise<IntroductionDelivery | undefined>;
  markIntroductionShared(
    id: string,
    message: IntroductionEmailMessage,
    initiatingCoordinatorId: string | null
  ): Promise<boolean>;
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
}

export interface IntroductionSendResult {
  delivered: boolean;
  transport: "local" | "resend";
}

export interface DeliverIntroductionInput {
  requestId: string;
  initiatingCoordinatorId: string | null;
  now: string;
  repository: IntroductionDeliveryRepository;
  send: (
    message: IntroductionEmailMessage,
    options: IntroductionSendOptions
  ) => Promise<IntroductionSendResult>;
}

export async function deliverIntroductionAttempt(
  input: DeliverIntroductionInput
): Promise<{ shared: boolean; pending: boolean }> {
  const repository = input.repository;
  await repository.reconcile();
  const claim = await repository.claimIntroduction(
    input.requestId,
    input.now,
    input.initiatingCoordinatorId
  );
  if (!claim)
    return {
      shared: false,
      pending: await repository.hasPendingIntroduction(input.requestId),
    };

  const delivery = await repository.introductionDelivery(claim.id);
  if (!delivery) {
    await repository.releaseIntroduction(claim.id);
    return {
      shared: false,
      pending: await repository.hasPendingIntroduction(input.requestId),
    };
  }

  const message: IntroductionEmailMessage = {
    to: delivery.staffEmail,
    subject: `Perkenalan alumni: ${delivery.title}`,
    text: `Kepada ${delivery.staffName},\n\n${delivery.memberName} (${delivery.memberEmail}) menyetujui emailnya dibagikan kepada Anda untuk kebutuhan sekolah berikut.\n\nKebutuhan: ${delivery.title}\nTujuan sekolah: ${delivery.purpose}\nBantuan yang diminta: ${delivery.requestedHelp}\n\nAlumni tersebut telah memberikan persetujuan eksplisit untuk perkenalan ini. Silakan hubungi langsung melalui email di atas.`,
  };

  let result: IntroductionSendResult;
  try {
    result = await input.send(message, {
      idempotencyKey: `outreach-introduction:${claim.id}`,
      localCapture: () =>
        repository.captureIntroduction(claim.id, message, input.initiatingCoordinatorId),
    });
  } catch {
    await repository.releaseIntroduction(claim.id);
    return {
      shared: false,
      pending: await repository.hasPendingIntroduction(input.requestId),
    };
  }

  if (!result.delivered) {
    await repository.releaseIntroduction(claim.id);
    return {
      shared: false,
      pending: await repository.hasPendingIntroduction(input.requestId),
    };
  }

  if (result.transport === "resend") {
    let shared: boolean;
    try {
      shared = await repository.markIntroductionShared(
        claim.id,
        message,
        input.initiatingCoordinatorId
      );
    } catch {
      shared = false;
    }
    if (!shared) {
      await repository.releaseIntroduction(claim.id);
      return {
        shared: false,
        pending: await repository.hasPendingIntroduction(input.requestId),
      };
    }
  }

  return {
    shared: true,
    pending: await repository.hasPendingIntroduction(input.requestId),
  };
}
