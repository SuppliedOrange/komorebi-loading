addEventListener("DOMContentLoaded", (event) => {
	const { ipcRenderer } = require("electron");

	const minimizeButton = document.querySelector(".minimize-button");
	if (minimizeButton) {
		minimizeButton.addEventListener("click", () => {
			ipcRenderer.send("minimize-window");
		});
	}

	const closeButtons = document.querySelectorAll(".close-button");

	closeButtons.forEach((closeButton) => {
		closeButton.addEventListener("mouseover", () => {
            closeButton.textContent = "goodbye :(";

            closeButton.classList.remove("goodbye-anim");
            void closeButton.offsetWidth;
            closeButton.classList.add("goodbye-anim");
        });

        closeButton.addEventListener("mouseout", () => {
            closeButton.textContent = "end";
            closeButton.classList.remove("goodbye-anim");
        });

		closeButton.addEventListener("click", () => {
			window.close();
		});
	});
});
