import { Link } from "react-router-dom";

function NoMatch() {
  return (
    <div>
      <h2>Nothing to see here!</h2>
      <p>
        <Link to="/">Go to the home page 3</Link>
      </p>
    </div>
  );
}

export default NoMatch;