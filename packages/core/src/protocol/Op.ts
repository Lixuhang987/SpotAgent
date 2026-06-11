import type { ClientResponse } from "./ClientResponse.ts";

export type RuntimeOp = UserInputOp | InterruptOp;
export type Op = RuntimeOp | ClientResponseOp;

export type UserInput = {
  items: InputItem[];
};

export type UserInputOp = {
  type: "user_input";
  opId: string;
  timestamp: string;
  payload: UserInput;
};

export type InterruptOp = {
  type: "interrupt";
  opId: string;
  timestamp: string;
  payload: {
    reason: "user" | "system";
  };
};

export type ClientResponseOp = {
  type: "client_response";
  opId: string;
  timestamp: string;
  payload: {
    response: ClientResponse;
  };
};

export type InputItem =
  | TextInputItem
  | ImageInputItem
  | SkillInputItem
  | TextSelectionInputItem;

export type TextInputItem = {
  type: "text";
  id: string;
  text: string;
};

export type ImageInputItem = {
  type: "image";
  id: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
};

export type SkillInputItem = {
  type: "skill";
  id: string;
  actionId: string;
  title: string;
  prompt: string;
};

export type TextSelectionInputItem = {
  type: "text_selection";
  id: string;
  text: string;
};
