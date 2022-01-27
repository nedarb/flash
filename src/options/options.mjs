/// <reference path="../global.d.ts" />
import "../webextension-polyfill.js";

import {
  html,
  render,
  useState,
  useEffect,
  useCallback,
} from "../standalone.mjs";
import CustomActions from "./CustomActions.mjs";

const manifest = browser.runtime.getManifest();
const optionalPermissions = manifest.optional_permissions || [];

function getPermissionLabel(name) {
  switch (name) {
    case "browsingData":
      return "Browsing data";
    default:
      return name;
  }
}

function OptionalPermission({ name, isEnabled, onToggle }) {
  const handleToggle = useCallback(
    () => onToggle({ name, isEnabled }),
    [name, isEnabled, onToggle]
  );
  return html`<tr key=${name}>
    <td>${getPermissionLabel(name)}</td>
    <td>${isEnabled ? "Yes" : "No"}</td>
    <td><button onClick=${handleToggle}>${isEnabled ? "Disable" : "Enable"}</button></td>
  </tr>`;
}

function MyCmp() {
  const [hasPermission, setHasPermission] = useState([]);
  const [customActions, setCustomActions] = useState(null);
  useEffect(async () => {
    const permissionValues = await Promise.all(
      optionalPermissions.map((perm) =>
        browser.permissions
          .contains({ permissions: [perm] })
          .then((isEnabled) => ({ name: perm, isEnabled }))
      )
    );
    setHasPermission(permissionValues);
  }, []);
  const handleToggle = useCallback(async ({ name, isEnabled }) => {
    if (isEnabled) {
      const result = await browser.permissions.remove({ permissions: [name] });
      if (result) {
        setHasPermission((existing) => {
          const allButThis = existing.filter((p) => p.name !== name);
          return [...allButThis, { name, isEnabled: false }];
        });
      }
    } else {
      const result = await browser.permissions.request({ permissions: [name] });
      if (result) {
        setHasPermission((existing) => {
          const allButThis = existing.filter((p) => p.name !== name);
          return [...allButThis, { name, isEnabled: result }];
        });
      }
    }
  });
  return html`<table>
    <tr>
      <th>Permission</th>
      <th>Is Enabled?</th>
      <th></th>
    </tr>
    ${hasPermission &&
    hasPermission.map(
      ({ name, isEnabled }) =>
        html`<${OptionalPermission}
          key=${name}
          name=${name}
          isEnabled=${isEnabled}
          onToggle=${handleToggle}
        />`
    )}
  </table>`;
}

render(
  html`<div>
    <${MyCmp} />
    <${CustomActions} />
  </div>`,
  document.getElementById("app")
);
