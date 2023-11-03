import { Link } from "react-router-dom";

function NoMatch() {
    /* A "layout route" is a good place to put markup you want to
        share across all the pages on your site, like navigation. */
  return (
    <nav>
      <ul>
        <li><Link to="/">Home</Link></li>
        <li><Link to="/about">About</Link></li>
        <li><Link to="/dashboard">Dashboard</Link></li>
        <li><Link to="/nothing-here">Nothing Here</Link></li>
      </ul>
    </nav>
  );
}

export default NoMatch;