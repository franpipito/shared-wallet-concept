/**
 * Los RPC levantan códigos estables en inglés (el `message` de la excepción).
 * Acá se traducen a algo que una persona pueda leer.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Iniciá sesión para continuar.",
  invalid_amount: "Ingresá un monto mayor a cero.",
  invalid_goal: "La meta tiene que ser mayor a cero.",
  invalid_dates: "La fecha de fin no puede ser anterior al inicio.",
  reserve_not_found: "No encontramos esta reserva.",
  reserve_closed: "La reserva ya está cerrada.",
  not_a_member: "No sos miembro de esta reserva.",
  not_reserve_owner: "Solo quien creó la reserva puede hacer esto.",
  alias_not_found: "No encontramos a nadie con ese alias.",
  cannot_invite_self: "Ese alias es el tuyo.",
  already_invited: "Esa persona ya está invitada.",
  invitation_not_found: "Esta invitación ya no está disponible.",
  invitation_already_answered: "Esta invitación ya fue respondida.",
  insufficient_wallet_funds: "No te alcanza el saldo de tu billetera.",
  insufficient_reserve_funds: "La reserva no tiene saldo suficiente.",
  spend_limit_exceeded: "Superás tu límite de gasto en esta reserva.",
  category_required: "Elegí una categoría para el pago.",
  email_taken: "Ya existe una cuenta con ese email.",
  alias_taken: "Ese alias ya está en uso.",
  invalid_credentials: "Email o contraseña incorrectos.",
};

export class AppError extends Error {
  readonly code: string;
  constructor(code: string, fallback?: string) {
    super(MESSAGES[code] ?? fallback ?? "Algo salió mal. Probá de nuevo.");
    this.code = code;
    this.name = "AppError";
  }
}

export function messageFor(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return MESSAGES[error.message] ?? error.message;
  return "Algo salió mal. Probá de nuevo.";
}
