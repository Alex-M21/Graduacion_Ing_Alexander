import body from "../web/body.html?raw";
import StaticInvitation from "./static-invitation";
export default function Home() {
  return <><link rel="stylesheet" href="/web/styles.css"/><link rel="stylesheet" href="/web/faculty.css"/><StaticInvitation html={body}/></>;
}
