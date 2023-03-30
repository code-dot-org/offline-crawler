if (!window.__offline_replaced) {
  window.__offline_replaced = true;

  // This is the User model info given to the front-end components via
  // the 'users/current' api.
  const DEFAULT_USER = {
    is_signed_in: true,
    username: "student",
    user_type: "student",
    id: 100000000,
    short_name: "student",
    is_verified_instructor: false,
    under_13: false
  };

  // This is replaced by the crawler to a listing of all crawled locales
  const LOCALES = ["%LOCALES%"];

  // This is replaced by the crawler to a mapping of youtube IDs to local
  // video files so that such links can be replaced with embedded video players.
  // It will be in the form of "id=path" where 'id' is the youtube video id and
  // path is the video file.
  const YOUTUBE_VIDEOS = ["%YOUTUBE_VIDEOS%"];

  // This holds the path for PDF files representing any linked google doc.
  // When we see a link to a google doc, we want to replace it with a link to
  // download or view the pdf file.
  const GDOC_PDFS = ["%GDOC_PDFS%"];

  // This helps us map extra levels by id to their given URL.
  // This will be in the form of "id=url" where id is the level id and url is
  // the given URL that was crawled for the extra level. We want to capture
  // links to bonus levels on the extras page and redirect to the appropriate
  // URL.
  const EXTRA_LEVELS = ["%EXTRA_LEVELS%"];

  // Get current locale
  window.__locale = "en-US";
  let dropdown = document.querySelector('select#locale');
  if (dropdown) {
    window.__locale = dropdown.value;
  }

  try {
      window.__localStorage = window.localStorage;
      window.__sessionStorage = window.sessionStorage;
      window.__indexedDB = window.indexedDB;
  }
  catch {
  }

  function fixupLocaleDropdown() {
    // The footer was modified, try to find the locale dropdown
    let dropdown = document.querySelector('select#locale');
    if (dropdown) {
      // Remove any locales we don't have
      dropdown.querySelectorAll("option").forEach( (option) => {
        if (LOCALES.indexOf(option.getAttribute('value')) < 0) {
          option.remove();
        }
      });

      // Get the current locale
      window.__locale = dropdown.value;

      // Hijack the behavior when the locale is updated
      // It needs to reload the current page in the given locale
      // (replace /s-<locale> in current URL with selected locale)
      let form = document.querySelector('form#localeForm');
      if (form && !form.hasAttribute('bound')) {
        form.setAttribute('bound', '');
        form.setAttribute('action', '');
        form.submit = () => {
          let option = dropdown.value;
          let url = document.location.href;
          let base = url.substring(0, url.indexOf('/s-'));
          let rest = url.substring(base.length + 1);
          rest = rest.substring(rest.indexOf('/'));
          let newURL = base + '/s-' + option + rest;
          console.log("navigating to", option, newURL);
          document.location.href = newURL;
        };
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          event.stopPropagation();
          form.submit();
        });
      }
    }
  }

  function callApi(method, path, data) {
    let args = path.split('/');
    let call = args[0];
    let response = null;

    try {
      console.log("[api]", path);
      if (call === "user_progress") {
        response = {
          data: {
            signedIn: false
          },
          headers: {
            "content-type": "application/json"
          }
        };
      }
      else if (call === "v1") {
        call = args[1];
        args = args.slice(1);

        if (call === "users" && (args[1] === "current" || args[1] === "current.json")) {
          response = {
            data: DEFAULT_USER,
            headers: {
              "content-type": "application/json"
            }
          };
        }
        else {
          console.log("[api] WARNING: unimplemented v1 api call:", call, args);
        }
      }
      else if (call === "example_solutions") {
        response = {
          data: [],
          headers: {
            "content-type": "application/json"
          }
        };
      }
      else if (call === "hidden_lessons") {
        response = {
          data: [],
          headers: {
            "content-type": "application/json"
          }
        };
      }
      else if (call === "user_app_options") {
        response = {
          data: {
            signedIn: false,
            channel: "blah",
            reduceChannelUpdates: false
          },
          headers: {
            "content-type": "application/json"
          }
        };
      }
      else if (call === "channels") {
        // Get channel metadata

        // Maintain channel id
        window.__channel = args[1];
        let updated = window.localStorage.getItem("__channel_" + window.__channel + "_updated");
        let thumbnail = window.localStorage.getItem("__channel_" + window.__channel + "_thumbnail");
        let projectType = window.localStorage.getItem("__channel_" + window.__channel + "_projectType");
        let level = window.localStorage.getItem("__channel_" + window.__channel + "_level");

        // Default response (on initial load)
        let date = (new Date()).toISOString();
        response = {
          data: {
            "hidden": false,
            "createdAt": date,
            "updatedAt": date,
            "id": args[1],
            "isOwner": true,
            "publishedAt": null,
            "projectType": null
          },
          headers: {
            "content-type": "application/json"
          }
        }

        // If we have written to it before, say it is in S3
        if (updated) {
          response.data.migratedToS3 = true;
        }

        if (thumbnail) {
          response.data.thumbnailUrl = thumbnail;
        }

        if (projectType) {
          response.data.projectType = projectType;
        }

        if (level) {
          response.data.level = level;
        }
      }
      else if (call === "sources" || call === "files") {
        // Get saved progress
        let filename = args.slice(1).join("/");
        let basename = args[args.length - 1].split('?')[0];

        if (basename === "versions") {
          // Get the version history of a file
          filename = args.slice(1, args.length - 1).join("/");
          console.log("[api] reading versions for file:", filename);
          let versions = JSON.parse(
            window.localStorage.getItem(call + "/" + filename + "/versions") || "[]"
          );
          let latest = window.localStorage.getItem(call + "/" + filename + "/latest");

          // Mark latest
          for (let i = 0; i < versions.length; i++) {
            if (versions[i].versionId == latest) {
              versions[i].isLatest = true;
            }

            versions[i].isLatest = false;
          }

          response = {
            data: versions,
            headers: {
              "content-type": "application/json"
            }
          };
        }
        else if (basename === "restore") {
          // Restore level to particular version
          // It does this by storing the version record again at the head of the
          // version list.
          let restore = args[args.length - 1].split('?')[1].split('=')[1];
          console.log("[api] restoring", restore);

          let version = Math.random().toString().substring(2);
          let versions = JSON.parse(
              window.localStorage.getItem(call + "/" + filename + "/versions") || "[]"
          );
          let modified = (new Date()).toISOString();
          versions.push({
            versionId: version,
            lastModified: modified
          });
          window.localStorage.setItem(call + "/" + filename + "/versions", JSON.stringify(versions));
          window.localStorage.setItem(call + "/" + filename + "/latest", version);
        }
        else if (method === "GET") {
          // Retrieve file
          filename = filename.split('?')[0];
          console.log("[api] reading file at path:", filename);

          // Negotiate version
          let latest = window.localStorage.getItem(call + "/" + filename + "/latest");
          response = {
            data: window.localStorage.getItem(call + "/" + filename + "/versions/" + latest),
            headers: {
              "content-type": "application/json",
              "s3-version-id": latest
            }
          };
        }
        else {
          // Store file
          filename = filename.split('?')[0];
          console.log("[api] writing file at path:", filename, data);

          // Remove the channel name
          let itemPath = filename.split('/').slice(1).join('/');

          // Detect if we are writing a thumbnail
          let category = "application";
          if (data.arrayBuffer) {
            category = "image";
            data = "";
            window.localStorage.setItem("__channel_" + window.__channel + "_thumbnail", "/v3/" + path);
          }

          // Add a version
          let version = Math.random().toString().substring(2);
          window.localStorage.setItem(call + "/" + filename + "/versions/" + version, data);
          let versions = JSON.parse(
              window.localStorage.getItem(call + "/" + filename + "/versions") || "[]"
          );
          let modified = (new Date()).toISOString();
          versions.push({
            versionId: version,
            lastModified: modified
          });
          window.localStorage.setItem(call + "/" + filename + "/versions", JSON.stringify(versions));
          window.localStorage.setItem(call + "/" + filename + "/latest", version);

          // Update channel
          window.localStorage.setItem("__channel_" + window.__channel + "_updated", "true");

          // Report the version
          response = {
            data: {
              filename: itemPath,
              category: category,
              size: data.byteLength || data.length,
              versionId: version,
              timestamp: modified
            },
            headers: {
              "content-type": "application/json"
            }
          };
        }
      }
    }
    catch(e) {
      console.error("[api]" + e);
    }

    return response;
  }

  // Disable sessionStorage
  let sessionStorage = {};
  window.__defineGetter__('sessionStorage', function() {
    return {
      getItem: function(key) {
        console.log("[persist] sessionStorage.get", key);
        if (window.__sessionStorage) {
          return window.__sessionStorage.getItem(key);
        }
        else if (key in sessionStorage) {
          return sessionStorage[key];
        }
        else
        {
          return null;
        }
      },
      setItem: function(key, value) {
        console.log("[persist] sessionStorage.set", key, value);
        if (window.__sessionStorage) {
          return window.__sessionStorage.setItem(key, value);
        }
        return sessionStorage[key] = value;
      },
      removeItem: function(key) {
        if (window.__sessionStorage) {
          return window.__sessionStorage.removeItem(key);
        }
        delete sessionStorage[key];
      }
    };
  });

  // Disable localStorage
  let localStorage = {};
  window.__defineGetter__('localStorage', function() {
    return {
      getItem: function(key) {
        console.log("[persist] localStorage.get", key);
        if (window.__localStorage) {
          return window.__localStorage.getItem(key);
        }
        else if (key in localStorage) {
          return localStorage[key];
        }
        else
        {
          return null;
        }
      },
      setItem: function(key, value) {
        console.log("[persist] localStorage.set", key, value);
        if (window.__localStorage) {
          return window.__localStorage.setItem(key, value);
        }
        return localStorage[key] = value;
      },
      removeItem: function(key) {
        if (window.__localStorage) {
          return window.__localStorage.removeItem(key);
        }
        delete localStorage[key];
      }
    };
  });

  // Disable cookies
  document.__defineGetter__('cookie', function() { console.log("[persist] cookie.get"); return '' });
  document.__defineSetter__('cookie', function(v) { console.log("[persist] cookie.set", v); });

  window.addEventListener('load', () => {
    var userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.indexOf(' electron/') > -1) {
      // This is an electron app.
    }

    // Make sure we re-write the header links
    // Select the node that will be observed for mutations
    const targetNode = document.querySelector('.header_level');
    if (targetNode) {
      // Options for the observer (which mutations to observe)
      const config = { attributes: true, childList: true, subtree: true };

      // Callback function to execute when mutations are observed
      const callback = (mutationList, observer) => {
        for (const mutation of mutationList) {
          if (mutation.type === 'childList') {
            // The header was built... modify the links
            targetNode.querySelectorAll('a').forEach( (link) => {
              let url = link.getAttribute('href');
              if (url) {
                url = url.replace("../../../../../s/", "../../../../");
                if (url.indexOf("/s-") >= 0) {
                  url = "../../../../.." + url.substring(url.indexOf("/s-"));
                }
                if (url[0] === "/") {
                  url = "../../../../.." + url;
                }
                if (!url.endsWith(".html")) {
                  url = url + ".html";
                }
                link.setAttribute('href', url);
              }
            });
          //} else if (mutation.type === 'attributes') {
          }
        }
      };

      // Create an observer instance linked to the callback function
      const observer = new MutationObserver(callback);

      callback([{type: 'childList'}], observer);

      // Start observing the target node for configured mutations
      observer.observe(targetNode, config);
    }

    // Make sure we re-write the certificate page
    // Select the node that will be observed for mutations
    const targetCongratsNode = document.querySelector('#congrats-container');
    if (targetCongratsNode) {
      // Options for the observer (which mutations to observe)
      const config = { attributes: true, childList: true, subtree: true };

      // Callback function to execute when mutations are observed
      const callback = (mutationList, observer) => {
        for (const mutation of mutationList) {
          if (mutation.type === 'childList') {
            // The certificate container was built... modify the links
            targetCongratsNode.querySelectorAll('a').forEach( (link) => {
              let url = link.getAttribute('href');
              if (url && url.indexOf('/certificates/') >= 0) {
                // Download the certificate itself
                if (!link.__bound) {
                  link.__bound = true;
                  link.addEventListener('click', (event) => {
                    event.stopPropagation();
                    event.preventDefault();

                    let img = link.querySelector('img');
                    if (img) {
                      if (img.src.startsWith('data')) {
                        // Download the image
                        var dllink = document.createElement("a");
                        dllink.download = "hoc-certificate.png";
                        dllink.href = img.src;
                        document.body.appendChild(dllink);
                        dllink.click();
                        document.body.removeChild(dllink);
                        dllink.remove();
                      }
                    }
                  });
                }
              }
              else if (url && url.indexOf('/print_certificates/') >= 0) {
                // Present a printable certificate
              }
              else {
                // Assume this is the "back to activity" link... so send it back
                link.setAttribute('href', document.referrer);
              }
            });

            let nameField = targetCongratsNode.querySelector('input#name');
            targetCongratsNode.querySelectorAll('button').forEach( (button) => {
              if (button.querySelector('.fa-print')) {
                // Print button
                button.addEventListener('click', (event) => {
                  event.stopPropagation();
                  event.preventDefault();
                });
              }
              else {
                // Assume the submit button
                button.addEventListener('click', (event) => {
                });
              }
            });

            targetCongratsNode.querySelectorAll('img').forEach( (img) => {
              if (!img.__setAttribute) {
                img.__setAttribute = true;
                img.__originalSrc = img.src;
                img.setAttribute = function(attribute, url) {
                  if (attribute === "src") {
                    if (url.startsWith("/certificate_images")) {
                      console.log("set attribute", attribute, url);

                      // Draw the given name at the given position
                      let name = nameField.value;
                      let x = img.naturalWidth / 2;
                      let y = 530;

                      // Generate a canvas (an offscreen canvas is likely better, here,
                      // but support is unknown for our audience just yet.)
                      let canvas = document.createElement('canvas');
                      canvas.style.position = 'absolute';
                      canvas.style.left = '-9999px';
                      canvas.style.width = img.naturalWidth + 'px';
                      canvas.style.height = img.naturalHeight + 'px';
                      canvas.setAttribute('width', img.naturalWidth);
                      canvas.setAttribute('height', img.naturalHeight);
                      document.body.appendChild(canvas);

                      // Start with the canvas image
                      let ctx = canvas.getContext('2d');
                      ctx.drawImage(img, 0, 0);

                      // Draw the name
                      ctx.textAlign = 'center';
                      ctx.font = '100px serif';
                      ctx.fillText(name, x, y, img.naturalWidth * 0.75);

                      // Resupply the image with the new rendered image
                      img.src = canvas.toDataURL();

                      // Remove our canvas
                      canvas.remove();
                    }
                  }
                }
              };
            });
          //} else if (mutation.type === 'attributes') {
          }
        }
      };

      // Create an observer instance linked to the callback function
      const observer = new MutationObserver(callback);

      callback([{type: 'childList'}], observer);

      // Start observing the target node for configured mutations
      observer.observe(targetCongratsNode, config);
    }

    // Make sure we re-write the course lesson links
    // Select the node that will be observed for mutations
    const targetCourseNode = document.querySelector('.user-stats-block');
    if (targetCourseNode) {
      // Options for the observer (which mutations to observe)
      const config = { attributes: true, childList: true, subtree: true };

      // Callback function to execute when mutations are observed
      const course_callback = (mutationList, observer) => {
        for (const mutation of mutationList) {
          if (mutation.type === 'childList') {
            // The course listing was built... modify the links
            targetCourseNode.querySelectorAll('a').forEach( (link) => {
              if (!link.hasAttribute('data-reformed')) {
                link.setAttribute('data-reformed', '');
                let url = link.getAttribute('href');
                console.log("transforming", url);
                if (url) {
                  url = url.replace("../../../../../s/", "./");
                  url = url.replace("../s/", "./");
                  if (!url.endsWith(".html")) {
                    url = url + ".html";
                  }
                  link.setAttribute('href', url);
                }
              }
            });
            //} else if (mutation.type === 'attributes') {
          }
        }
      };

      // Create an observer instance linked to the callback function
      const course_observer = new MutationObserver(course_callback);

      course_callback([{type: 'childList'}], course_observer);

      // Start observing the target node for configured mutations
      course_observer.observe(targetCourseNode, config);
    }

    // Make sure we re-write the localization dropdown
    // Select the node that will be observed for mutations

    const targetFooterNode = document.querySelector('#page-small-footer');
    if (targetFooterNode) {
      // Options for the observer (which mutations to observe)
      const config = { attributes: true, childList: true, subtree: true };

      // Callback function to execute when mutations are observed
      const footer_callback = (mutationList, observer) => {
        for (const mutation of mutationList) {
          if (mutation.type === 'childList') {
            // The footer was modified, try to find the locale dropdown
            let dropdown = targetFooterNode.querySelector('select#locale');
            if (dropdown) {
              fixupLocaleDropdown();
            }
          }
        }
      };

      // Create an observer instance linked to the callback function
      const footer_observer = new MutationObserver(footer_callback);

      footer_callback([{type: 'childList'}], footer_observer);

      // Start observing the target node for configured mutations
      footer_observer.observe(targetFooterNode, config);
    }
    fixupLocaleDropdown();

    const targetExtrasNode = document.querySelector('#lesson-extras');
    if (targetExtrasNode) {
      // Options for the observer (which mutations to observe)
      const config = { attributes: true, childList: true, subtree: true };

      // Callback function to execute when mutations are observed
      const extras_callback = (mutationList, observer) => {
        for (const mutation of mutationList) {
          if (mutation.type === 'childList') {
            // The extras list was modified, try to find links to bonus levels
            targetExtrasNode.querySelectorAll('a').forEach( (link) => {
              let href = link.getAttribute('href');
              if (href && href.indexOf('extras.html?id') >= 0) {
                // Get the id
                let parts = href.split('extras.html?id=');
                EXTRA_LEVELS.forEach( (level) => {
                  let compare_id = level.split('=')[0];
                  if (compare_id === parts[1]) {
                    href = parts[0] + level.split('=')[1];
                    link.setAttribute('href', href);
                  }
                });
              }
            });
          }
        }
      };

      // Create an observer instance linked to the callback function
      const extras_observer = new MutationObserver(extras_callback);

      extras_callback([{type: 'childList'}], extras_observer);

      // Start observing the target node for configured mutations
      extras_observer.observe(targetExtrasNode, config);
    }

    const targetPlanNode = document.querySelector('.lesson-overview');
    if (targetPlanNode) {
      // Options for the observer (which mutations to observe)
      const config = { attributes: true, childList: true, subtree: true };

      // Callback function to execute when mutations are observed
      const plan_callback = (mutationList, observer) => {
        for (const mutation of mutationList) {
          if (mutation.type === 'childList') {
            // The plan list was modified, try to find links to bonus levels
            targetPlanNode.querySelectorAll('a').forEach( (link) => {
              let href = link.getAttribute('href');
              if (href && href.indexOf('docs.google') >= 0) {
                // Get the id
                let parts = href.split('/d/');
                GDOC_PDFS.forEach( (pdf) => {
                  let compare_id = pdf.split('=')[0];
                  if (compare_id === parts[1].split('/')[0]) {
                    href = "../../../" + pdf.split('=')[1];
                    link.setAttribute('href', href);
                  }
                });
              }
            });
          }
        }
      };

      // Create an observer instance linked to the callback function
      const plan_observer = new MutationObserver(plan_callback);

      plan_callback([{type: 'childList'}], plan_observer);

      // Start observing the target node for configured mutations
      plan_observer.observe(targetPlanNode, config);
    }
  });

  // Ensure absolute paths get turned into relative paths
  let oldXHR = XMLHttpRequest;
  window.XMLHttpRequest = function() {
    let ret = new oldXHR(arguments);
    let oldOpen = ret.open;
    ret.open = function(method, url, async, user, password) {
      // Deal with the weird proxy stuff via 'media?u='
      // stuff like: studio.learningequality.org/media?u=https%3A%2F%2Fstudi...
      let idx = url.indexOf("media?u");
      if (idx > 0) {
        idx += 8;
        url = decodeURIComponent(url.substring(idx));
      }

      // Now overwrite the code.org urls
      let domains = [
        "https://studio.code.org",
        "https://code.org",
      ];

      for (let i = 0; i < domains.length; i++) {
        let domain = domains[i];
        if (url.startsWith(domain)) {
          url = url.substring(domain.length);
          break;
        }
      }

      // Redirect video transcripts / notes
      if (url.startsWith("/notes/")) {
        url = url.substring(7);
        url = "/notes-" + window.__locale + "/" + url;
      }

      // Transform absolute to relative (assuming level URL path)
      if (url[0] === "/") {
        url = "../../../../.." + url;
      }
      arguments[1] = url;

      let oldSend = ret.send;
      ret.send = function(data) {
        let response = null;
        let path = url;

        // Redirect API calls to our own internal implementation
        if (url.startsWith("../../../../../api/")) {
          path = url.substring("../../../../../api/".length);
          response = callApi(method, path, data);
        }

        // API calls can also come in at these '/v3/' paths
        if (url.startsWith("../../../../../v3/")) {
          path = url.substring("../../../../../v3/".length);
          response = callApi(method, path, data);
        }

        try {
          if (response) {
            response.status = response.status || 200;
            let headers = response.headers;
            let rHeaders = {};
            ret.setRequestHeader = function(header, value) {
              rHeaders[header] = value;
            };
            ret.getResponseHeader = function(header) {
              header = header.toLowerCase();
              return headers[header];
            };
            ret.getAllResponseHeaders = function() {
              let headerString = "";
              for (const header of Object.keys(headers)) {
                let value = ret.getResponseHeader(header);
                headerString = headerString + header + ": " + value + "\r\n";
              }
              return headerString;
            };
            ret.__defineGetter__('response', function() {
              return response.data;
            });
            ret.__defineGetter__('status', function() {
              return response.status;
            });
            ret.__defineGetter__('statusText', function() {
              if (response.status === 404) {
                return "Not found";
              }
              return "OK";
            });
            ret.__defineGetter__('readyState', function() {
              return 4;
            });
            // If the response is an object, text is the JSON string for it:
            let text = response.data;
            if (typeof response.data !== "string") {
              text = JSON.stringify(response.data);
            }
            ret.__defineGetter__('responseText', function() {
              return text;
            });

            console.log("[api]", path.split('/')[0], ret.response);

            let ev = new ProgressEvent("load");
            ev.total = text.length;
            ev.loaded = ev.total;
            ev.lengthComputable = true;
            let rscev = new Event("readystatechange");

            ret.dispatchEvent(ev);
            ret.dispatchEvent(rscev);
            return;
          }
        }
        catch (e) {
          console.error("[api]" + e);
        }

        return oldSend.bind(this)(arguments);
      };

      return oldOpen.bind(this)(method, url, async, user, password);
    };

    return ret;
  };

  // Same for fetch()
  let oldFetch = window.fetch;
  window.fetch = function(url, options) {
    if (url[0] === "/") {
      url = "../../../../.." + url;
    }

    response = null;
    if (url.startsWith("../../../../../api/")) {
      path = url.substring("../../../../../api/".length);
      response = callApi("GET", path);
    }

    // API calls can also come in at these '/v3/' paths
    if (url.startsWith("../../../../../v3/")) {
      path = url.substring("../../../../../v3/".length);
      response = callApi("GET", path);
    }

    if (response) {
      return new Promise( (resolve, reject) => {
        // If the response is an object, text is the JSON string for it:
        let text = response.data;
        if (typeof response.data !== "string") {
          text = JSON.stringify(response.data);
        }
        resolve(new Response(text));
      });
    }

    return oldFetch(url, options);
  };

  // Now we do some magic when images are loaded via <img> / <svg>
  let oldSANS = window.Element.prototype.setAttributeNS;
  window.Element.prototype.setAttributeNS = function(namespace, name, url) {
    if (name === "xlink:href" && url[0] === "/") {
      url = "../../../../.." + url;
    }
    return oldSANS.bind(this)(namespace, name, url);
  };
  let oldSA = window.Element.prototype.setAttribute;
  window.Element.prototype.setAttribute = function(name, url) {
    if (name === "src" && url[0] === "/") {
      url = "../../../../.." + url;
    }
    if (name === "href" && url[0] === "/") {
      url = "../../../../.." + url;
    }
    return oldSA.bind(this)(name, url);
  };

  // For "Image()" functions (like in Phaser)
  let types = [
    window.Image,
    window.Element,
    window.HTMLElement,
    window.HTMLScriptElement,
    window.HTMLImageElement
  ];

  for (let i = 0; i < types.length; i++) {
    let prototype = types[i].prototype;
    let oldSrc = prototype.__lookupSetter__('src');
    prototype.__defineSetter__('src', function(url) {
      if (url[0] === "/") {
        url = "../../../../.." + url;
      }
      // Also allows the image to be used inside unsafe contexts such as, of
      // course, a webgl texture!
      this.crossOrigin = "anonymous";
      oldSrc.bind(this)(url);
    });
  }
}
