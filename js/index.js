addEventListener("DOMContentLoaded", (event) => {
	const closeButtons = document.querySelectorAll(".close-button");

	closeButtons.forEach((closeButton) => {
		closeButton.addEventListener("mouseover", () => {
            		closeButton.textContent = "goodbye :(";
        });

          closeButton.addEventListener("mouseout", () => {
            closeButton.textContent = "end";
        });

	  closeButton.addEventListener("click", () => {
	    window.close();
		});
	});
});
