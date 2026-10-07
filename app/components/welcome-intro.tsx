import { alumniMessages } from "../content/alumni-messages";
export function WelcomeIntro() {
  return (
    <div className="home-intro">
      <p className="eyebrow" lang="en">
        {alumniMessages.home.eyebrow}
      </p>
      <h1 lang="en">
        {alumniMessages.home.headline[0]}
        <br />
        {alumniMessages.home.headline[1]}
        <br />
        <em>{alumniMessages.home.headline[2]}</em>
      </h1>
      <p className="intro-copy">{alumniMessages.home.introduction}</p>
      <div className="school-ribbon">
        <span aria-hidden="true">✦</span> Palembang, Sumatera Selatan
      </div>
    </div>
  );
}
