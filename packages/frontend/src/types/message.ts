export interface Message {
  id: number;
  from: "owner" | "agent";
  text: string;
}
